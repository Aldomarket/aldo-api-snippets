const axios = require('axios');
const cheerio = require('cheerio');

class NekopoiScraper {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'https://nekopoi.care';
        this.headers = {
            'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
            ...config.headers
        };
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            headers: this.headers,
            timeout: config.timeout || 15000,
            proxy: config.proxy || undefined,
            ...config.axiosOptions
        });
    }

    /**
     * Helper to resolve relative paths or slugs to full URLs.
     * @param {string} url 
     * @returns {string}
     */
    resolveUrl(url) {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    /**
     * Parse concatenated metadata from search descriptions.
     * @param {string} text 
     * @returns {Object}
     */
    parseSearchDescription(text) {
        const metadata = {};
        if (!text) return metadata;

        const keys = ['Original Title', 'Judul Asli', 'Parody', 'Parodi', 'Producers', 'Produser', 'Duration', 'Durasi', 'Genre', 'Size', 'Ukuran'];
        let matches = [];

        keys.forEach(k => {
            const regex = new RegExp(`(${k})\\s*:\\s*`, 'gi');
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    key: k,
                    index: match.index,
                    length: match[0].length
                });
            }
        });

        matches.sort((a, b) => a.index - b.index);

        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const next = matches[i + 1];
            const start = current.index + current.length;
            const end = next ? next.index : text.length;

            let value = text.substring(start, end).trim();
            if (!next) {
                value = value.replace(/\s*\.\.\.\s*$/, '');
            }

            const keyMap = {
                'Original Title': 'originalTitle',
                'Judul Asli': 'originalTitle',
                'Parody': 'parody',
                'Parodi': 'parody',
                'Producers': 'producers',
                'Produser': 'producers',
                'Duration': 'duration',
                'Durasi': 'duration',
                'Genre': 'genres',
                'Size': 'size',
                'Ukuran': 'size'
            };
            const normalizedKey = keyMap[current.key];
            if (normalizedKey) {
                metadata[normalizedKey] = value;
            }
        }
        return metadata;
    }

    /**
     * Fetch HTML content and return Cheerio API.
     * @param {string} urlPath 
     * @returns {Promise<cheerio.CheerioAPI>}
     */
    async getPage(urlPath) {
        const url = this.resolveUrl(urlPath);
        try {
            const response = await this.axiosInstance.get(url);
            return cheerio.load(response.data);
        } catch (error) {
            throw new Error(`Gagal memuat halaman: ${url}. Pesan: ${error.message}`);
        }
    }

    /**
     * Search anime/hentai by keyword.
     * @param {string} query 
     * @param {number} page 
     * @returns {Promise<Array>}
     */
    async search(query, page = 1) {
        const urlPath = page > 1 
            ? `/search/${encodeURIComponent(query)}/page/${page}/` 
            : `/search/${encodeURIComponent(query)}`;
        
        try {
            const $ = await this.getPage(urlPath);
            return this.parseList($);
        } catch (error) {
            // Fallback to WordPress query string search
            try {
                const fallbackUrl = page > 1 
                    ? `/page/${page}/?s=${encodeURIComponent(query)}`
                    : `/?s=${encodeURIComponent(query)}`;
                const $ = await this.getPage(fallbackUrl);
                return this.parseList($);
            } catch (fallbackError) {
                throw new Error(`Pencarian gagal untuk "${query}": ${error.message}`);
            }
        }
    }

    /**
     * Get latest episode/post releases from the homepage.
     * @param {number} page 
     * @returns {Promise<Array>}
     */
    async getLatest(page = 1) {
        const urlPath = page > 1 ? `/page/${page}/` : '/';
        const $ = await this.getPage(urlPath);
        return this.parseList($);
    }

    /**
     * Get posts by category (e.g. 'hentai', '3d-hentai', '2d-animation', 'jav', 'jav-cosplay').
     * @param {string} category 
     * @param {number} page 
     * @returns {Promise<Array>}
     */
    async getCategory(category, page = 1) {
        const urlPath = page > 1 ? `/category/${category}/page/${page}/` : `/category/${category}/`;
        const $ = await this.getPage(urlPath);
        return this.parseList($);
    }

    /**
     * Fetch the list of available genres.
     * @returns {Promise<Array>}
     */
    async getGenres() {
        const $ = await this.getPage('/genre-list/');
        const genres = [];
        
        // Try specific selectors
        const elements = $('.nk-genre-list a, .genre-list a, .genres a, ul.genres li a, .tagcloud a');
        elements.each((i, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (name && href) {
                const slug = href.split('/').filter(Boolean).pop();
                if (slug && !genres.some(g => g.slug === slug)) {
                    genres.push({ name, url: href, slug });
                }
            }
        });

        // Fallback: search for any links containing '/genres/'
        if (genres.length === 0) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const name = $(el).text().trim();
                if (href && href.includes('/genres/') && name) {
                    const slug = href.split('/').filter(Boolean).pop();
                    if (slug && !genres.some(g => g.slug === slug)) {
                        genres.push({ name, url: href, slug });
                    }
                }
            });
        }
        return genres;
    }

    /**
     * Get posts by genre.
     * @param {string} genre 
     * @param {number} page 
     * @returns {Promise<Array>}
     */
    async getByGenre(genre, page = 1) {
        const urlPath = page > 1 ? `/genres/${genre}/page/${page}/` : `/genres/${genre}/`;
        const $ = await this.getPage(urlPath);
        return this.parseList($);
    }

    /**
     * Get alphabetical list of all Hentai.
     * @returns {Promise<Array>}
     */
    async getHentaiList() {
        const $ = await this.getPage('/hentai-list/');
        const items = [];
        $('.nk-az-item a').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');
            
            // Extract cover and metadata from tooltip
            const tooltipHtml = $(el).attr('original-title') || '';
            let image = '';
            let metadata = {};
            if (tooltipHtml) {
                const _$ = cheerio.load(tooltipHtml);
                image = _$('.nk-tooltip-img').attr('src') || '';
                _$('.nk-tooltip-detail p').each((j, pEl) => {
                    const pText = _$(pEl).text().trim();
                    if (pText.includes(':')) {
                        const parts = pText.split(':');
                        const key = parts[0].trim();
                        const val = parts.slice(1).join(':').trim();
                        metadata[key] = val;
                    }
                });
            }

            if (title && href) {
                items.push({
                    title,
                    url: href,
                    slug: href.split('/').filter(Boolean).pop(),
                    image,
                    cover: image,
                    metadata
                });
            }
        });
        return items;
    }

    /**
     * Get alphabetical list of all JAV.
     * @returns {Promise<Array>}
     */
    async getJavList() {
        const $ = await this.getPage('/jav-list/');
        const items = [];
        $('.nk-az-item a').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');
            
            // Extract cover and metadata from tooltip
            const tooltipHtml = $(el).attr('original-title') || '';
            let image = '';
            let metadata = {};
            if (tooltipHtml) {
                const _$ = cheerio.load(tooltipHtml);
                image = _$('.nk-tooltip-img').attr('src') || '';
                _$('.nk-tooltip-detail p').each((j, pEl) => {
                    const pText = _$(pEl).text().trim();
                    if (pText.includes(':')) {
                        const parts = pText.split(':');
                        const key = parts[0].trim();
                        const val = parts.slice(1).join(':').trim();
                        metadata[key] = val;
                    }
                });
            }

            if (title && href) {
                items.push({
                    title,
                    url: href,
                    slug: href.split('/').filter(Boolean).pop(),
                    image,
                    cover: image,
                    metadata
                });
            }
        });
        return items;
    }

    /**
     * Get schedule of upcoming hentai releases.
     * @returns {Promise<Array>}
     */
    async getSchedule() {
        const $ = await this.getPage('/jadwal-new-hentai/');
        const schedule = [];
        $('.coming_soon').each((i, el) => {
            const title = $(el).find('a.title, .title').text().trim();
            const episode = $(el).find('.episode').text().trim().replace(/[\(\)]/g, '');
            const imgEl = $(el).find('img').first();
            const image = imgEl.attr('src') || imgEl.attr('data-src');
            
            const infoText = $(el).find('h2').last().text().trim();
            
            let producer = '';
            let releaseDate = $(el).find('.release_date').text().trim().replace(/[\n\r]/g, '');
            let subIndo = '';
            
            const prodMatch = infoText.match(/Producer\s*\/\s*Label\s*:\s*([^\n\r]+)/i);
            if (prodMatch) {
                producer = prodMatch[1].trim();
            }
            
            if (!releaseDate) {
                const relMatch = infoText.match(/Tanggal\s*Release\s*:\s*([^\n\r]+)/i);
                if (relMatch) {
                    releaseDate = relMatch[1].trim();
                }
            }
            
            const subMatch = infoText.match(/Sub\s*Indo\s*:\s*([^\n\r]+)/i);
            if (subMatch) {
                subIndo = subMatch[1].trim();
            }

            if (title) {
                schedule.push({
                    title,
                    episode,
                    image,
                    cover: image,
                    producer,
                    releaseDate,
                    subIndo
                });
            }
        });
        return schedule;
    }

    /**
     * Extract direct .m3u8 HLS stream URL from player iframe URL.
     * Supports both query parameter patterns (id/name) and pathname patterns.
     * @param {string} iframeUrl 
     * @returns {string|null}
     */
    extractM3u8(iframeUrl) {
        if (!iframeUrl) return null;

        try {
            const parsedUrl = new URL(iframeUrl);
            const streamId = parsedUrl.searchParams.get("name") || parsedUrl.searchParams.get("id");
            
            if (streamId && iframeUrl.includes('/play.html')) {
                const baseUrl = iframeUrl.split('/play.html')[0];
                return `${baseUrl}/streams/${streamId}.m3u8`;
            }
        } catch (error) {
            console.error("URL Iframe tidak valid:", error.message);
        }
        
        return null;
    }

    /**
     * Get details of a series or individual episode.
     * Automatically detects whether the page is a series page or an episode page.
     * @param {string} urlPath 
     * @returns {Promise<Object>}
     */
    async getDetail(urlPath) {
        const $ = await this.getPage(urlPath);
        const resolvedUrl = this.resolveUrl(urlPath);
        
        const title = $('h1.entry-title, h1.title, h1').first().text().trim() || $('h2').first().text().trim();
        
        // Check if page represents a series (has episode grid/details list)
        const isSeries = $('.nk-episode-grid, .nk-series-detail, .nk-series-meta-list').length > 0;
        
        if (isSeries) {
            const titleText = $('.nk-series-synopsis b').first().text().trim() || title;
            const posterStyle = $('.nk-series-poster').attr('style') || '';
            const posterMatch = posterStyle.match(/url\(['"]?(.*?)['"]?\)/);
            const poster = posterMatch ? posterMatch[1] : '';
            const synopsis = $('.nk-series-synopsis p').text().trim();
            
            const metadata = {};
            $('.nk-series-meta-list li').each((i, el) => {
                const text = $(el).text().trim();
                if (text.includes(':')) {
                    const parts = text.split(':');
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    if (key && value) {
                        metadata[key] = value;
                    }
                }
            });
            
            const episodes = [];
            $('.nk-episode-grid li a, .nk-episode-card').each((i, el) => {
                const epUrl = $(el).attr('href');
                const epTitle = $(el).find('.nk-episode-card-title').text().trim();
                const epBadge = $(el).find('.nk-episode-badge').text().trim();
                const epDate = $(el).find('.nk-episode-card-date').text().trim();
                const epStyle = $(el).find('.nk-episode-card-thumb').attr('style') || '';
                const epImgMatch = epStyle.match(/url\(['"]?(.*?)['"]?\)/);
                const epImage = epImgMatch ? epImgMatch[1] : '';
                
                if (epUrl) {
                    episodes.push({
                        title: epTitle || epBadge || `Episode ${i+1}`,
                        url: epUrl,
                        badge: epBadge,
                        date: epDate,
                        image: epImage
                    });
                }
            });
            
            return {
                type: 'series',
                title: titleText,
                url: resolvedUrl,
                poster,
                synopsis,
                metadata,
                episodes
            };
        } else {
            // Episode post page details
            const metadata = {};
            $('.konten p, .content p, .entry-content p').each((i, el) => {
                const text = $(el).text().trim();
                if (text.includes(':')) {
                    const parts = text.split(':');
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    if (key && value) {
                        metadata[key] = value;
                    }
                }
            });
            
            const embeds = [];
            const m3u8s = [];
            $('iframe').each((i, el) => {
                const src = $(el).attr('src');
                if (src) {
                    embeds.push(src);
                    const m3u8 = this.extractM3u8(src);
                    if (m3u8) m3u8s.push(m3u8);
                }
            });
            
            const downloads = [];
            $('.nk-download-box .nk-download-row, .download-box .download-row').each((i, el) => {
                const name = $(el).find('.nk-download-name, .download-name').text().trim();
                const links = [];
                $(el).find('a').each((j, aEl) => {
                    const host = $(aEl).text().trim();
                    const href = $(aEl).attr('href');
                    if (href) {
                        links.push({ host, url: href });
                    }
                });
                if (name && links.length > 0) {
                    downloads.push({ name, links });
                }
            });
            
            return {
                type: 'episode',
                title,
                url: resolvedUrl,
                metadata,
                embeds,
                m3u8s,
                downloads
            };
        }
    }

    /**
     * Parse HTML listing structures.
     * @param {cheerio.CheerioAPI} $ 
     * @returns {Array}
     */
    parseList($) {
        const results = [];

        // 1. Search Result Items
        if ($('.nk-search-item').length > 0) {
            $('.nk-search-item').each((i, el) => {
                const url = $(el).attr('href');
                const title = $(el).find('h2').text().trim();
                const style = $(el).find('.nk-search-thumb').attr('style') || '';
                const imgMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
                const image = imgMatch ? imgMatch[1] : '';
                const excerpt = $(el).find('.nk-search-desc').text().trim();
                
                // Parse description into detailed metadata fields
                const metadata = this.parseSearchDescription(excerpt);
                
                // Parse genres as tags/array if they are links, otherwise text
                const genres = [];
                $(el).find('.nk-search-genres a').each((j, aEl) => {
                    genres.push($(aEl).text().trim());
                });
                const genreVal = genres.length > 0 ? genres : $(el).find('.nk-search-genres').text().trim();

                if (url && title) {
                    results.push({ 
                        type: 'search_result', 
                        title, 
                        url, 
                        image, 
                        cover: image, // Support both image and cover properties
                        excerpt, 
                        genres: genreVal,
                        metadata 
                    });
                }
            });
        }

        // 2. Post Cards (Latest Episode Uploads)
        if ($('.nk-post-card').length > 0) {
            $('.nk-post-card').each((i, el) => {
                const titleEl = $(el).find('h2 a, h3 a').first();
                const title = titleEl.text().trim();
                const url = titleEl.attr('href');
                const style = $(el).find('.nk-thumb-crop').attr('style') || '';
                const imgMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
                const image = imgMatch ? imgMatch[1] : '';
                const date = $(el).find('.nk-post-meta span').text().trim();
                if (url && title) {
                    results.push({ 
                        type: 'latest_upload', 
                        title, 
                        url, 
                        image, 
                        cover: image, // Support both image and cover properties
                        date 
                    });
                }
            });
        }

        // 3. Series Links (Grid View in categories/tags/genres)
        if ($('.nk-series-link').length > 0) {
            $('.nk-series-link').each((i, el) => {
                const url = $(el).attr('href');
                const title = $(el).find('.title').text().trim();
                const style = $(el).find('.nk-hentai-thumb, .nk-grid-thumb').attr('style') || '';
                const imgMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
                const image = imgMatch ? imgMatch[1] : '';
                
                const tooltipHtml = $(el).attr('original-title') || '';
                let metadata = {};
                if (tooltipHtml) {
                    const _$ = cheerio.load(tooltipHtml);
                    _$('.nk-tooltip-detail p').each((j, pEl) => {
                        const pText = _$(pEl).text().trim();
                        if (pText.includes(':')) {
                            const parts = pText.split(':');
                            const key = parts[0].trim();
                            const val = parts.slice(1).join(':').trim();
                            metadata[key] = val;
                        }
                    });
                }

                if (url && title) {
                    results.push({ 
                        type: 'series_grid', 
                        title, 
                        url, 
                        image, 
                        cover: image, // Support both image and cover properties
                        metadata 
                    });
                }
            });
        }

        // 4. Fallback Generic Parser (WordPress Default)
        if (results.length === 0) {
            $('article, .eropost, .result-item, .post-item, .box, .result').each((i, el) => {
                const titleEl = $(el).find('h2 a, h3 a, .title a, a.title, .entry-title a').first();
                const title = titleEl.text().trim();
                const url = titleEl.attr('href');
                const imgEl = $(el).find('img').first();
                const image = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src');
                const excerpt = $(el).find('.entry-summary, .excerpt, p').first().text().trim();
                if (url && title) {
                    results.push({ 
                        type: 'generic_post', 
                        title, 
                        url, 
                        image, 
                        cover: image, // Support both image and cover properties
                        excerpt 
                    });
                }
            });
        }

        return results;
    }
}

// ==========================================
//    CLI & DEMO EXECUTION (DIRECT RUN)
// ==========================================
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        console.log(`
==================================================
        NEKOPOI HTML SCRAPER CLI & LIBRARY
==================================================
Penggunaan CLI:
  node nekopoi.js [perintah] [parameter]

Perintah yang tersedia:
  latest [page]             Menampilkan rilis episode terbaru (default page: 1)
  search [query] [page]     Mencari anime/hentai dengan kata kunci pencarian
  category [name] [page]    Menampilkan rilis berdasarkan kategori (e.g. 3d-hentai, hentai)
  genres                    Menampilkan seluruh daftar genre yang tersedia
  genre [name] [page]       Menampilkan rilis berdasarkan genre tertentu (e.g. action)
  hentai-list               Menampilkan seluruh daftar hentai secara alfabetis
  jav-list                  Menampilkan seluruh daftar JAV secara alfabetis
  schedule                  Menampilkan jadwal rilis hentai mendatang
  detail [url_atau_slug]    Menampilkan detail anime (synopsis/metadata), embed, & download link

Contoh Eksekusi:
  node nekopoi.js latest 1
  node nekopoi.js search mahiru
  node nekopoi.js schedule
  node nekopoi.js hentai-list
  node nekopoi.js detail hentai/oide-yo-mizuryuu-kei-land/
==================================================
`);
        process.exit(0);
    }

    const scraper = new NekopoiScraper();

    (async () => {
        try {
            console.log(`[Executing] Menjalankan perintah "${command}"...\n`);
            let result;

            switch (command.toLowerCase()) {
                case 'latest': {
                    const page = parseInt(args[1]) || 1;
                    result = await scraper.getLatest(page);
                    console.log(`Berhasil mengambil rilis terbaru (Halaman ${page}):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'search': {
                    const query = args.slice(1).join(' ');
                    if (!query) {
                        console.error("Error: Masukkan kata kunci pencarian.");
                        process.exit(1);
                    }
                    // Extract optional trailing page argument if it's a number
                    let page = 1;
                    const possiblePage = parseInt(args[args.length - 1]);
                    let searchQuery = query;
                    if (!isNaN(possiblePage) && args.length > 2) {
                        page = possiblePage;
                        searchQuery = args.slice(1, -1).join(' ');
                    }
                    result = await scraper.search(searchQuery, page);
                    console.log(`Hasil pencarian untuk "${searchQuery}" (Halaman ${page}):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'category': {
                    const category = args[1];
                    const page = parseInt(args[2]) || 1;
                    if (!category) {
                        console.error("Error: Masukkan nama kategori (contoh: 3d-hentai, 2d-animation, jav, jav-cosplay).");
                        process.exit(1);
                    }
                    result = await scraper.getCategory(category, page);
                    console.log(`Kategori "${category}" (Halaman ${page}):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'genres': {
                    result = await scraper.getGenres();
                    console.log(`Daftar genre yang tersedia:`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'genre': {
                    const genre = args[1];
                    const page = parseInt(args[2]) || 1;
                    if (!genre) {
                        console.error("Error: Masukkan nama genre (contoh: action, ahegao, milf).");
                        process.exit(1);
                    }
                    result = await scraper.getByGenre(genre, page);
                    console.log(`Genre "${genre}" (Halaman ${page}):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'hentai-list': {
                    result = await scraper.getHentaiList();
                    console.log(`Daftar Lengkap Hentai (A-Z):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'jav-list': {
                    result = await scraper.getJavList();
                    console.log(`Daftar Lengkap JAV (A-Z):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'schedule': {
                    result = await scraper.getSchedule();
                    console.log(`Jadwal Rilis Hentai Baru (Upcoming):`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'detail': {
                    const url = args[1];
                    if (!url) {
                        console.error("Error: Masukkan URL lengkap atau slug dari anime/episode.");
                        process.exit(1);
                    }
                    result = await scraper.getDetail(url);
                    console.log(`Detail untuk: ${url}`);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                default: {
                    console.error(`Error: Perintah "${command}" tidak dikenali.`);
                    break;
                }
            }
        } catch (error) {
            console.error(`[Error]: Terjadi kesalahan saat memproses data.`);
            console.error(error.message);
        }
    })();
}

module.exports = NekopoiScraper;