const axios = require('axios');

const colors = {
    pink: '#f68ac9',
    blue: '#6cace4',
    red: '#f44336',
    green: '#4caf50',
    yellow: '#ffeb3b',
    purple: '#9c27b0',
    darkblue: '#0d47a1',
    lightblue: '#03a9f4',
    ash: '#9e9e9e',
    orange: '#ff9800',
    black: '#000000',
    white: '#ffffff',
    teal: '#008080',
    lightpink: '#FFC0CB',
    chocolate: '#A52A2A',
    salmon: '#FFA07A',
    magenta: '#FF00FF',
    tan: '#D2B48C',
    wheat: '#F5DEB3',
    deeppink: '#FF1493',
    fire: '#B22222',
    skyblue: '#00BFFF',
    brightskyblue: '#1E90FF',
    hotpink: '#FF69B4',
    lightskyblue: '#87CEEB',
    seagreen: '#20B2AA',
    darkred: '#8B0000',
    orangered: '#FF4500',
    cyan: '#48D1CC',
    violet: '#BA55D3',
    mossgreen: '#00FF7F',
    darkgreen: '#008000',
    navyblue: '#191970',
    darkorange: '#FF8C00',
    darkpurple: '#9400D3',
    fuchsia: '#FF00FF',
    darkmagenta: '#8B008B',
    darkgray: '#2F4F4F',
    peachpuff: '#FFDAB9',
    darkishgreen: '#BDB76B',
    darkishred: '#DC143C',
    goldenrod: '#DAA520',
    darkishgray: '#696969',
    darkishpurple: '#483D8B',
    gold: '#FFD700',
    silver: '#C0C0C0'
};

module.exports = function(app) {
  const handleQcMaker = async (req, res) => {
    const text = req.query.text || req.body?.text;
    if (!text) {
      return res.status(400).json({ status: false, error: 'Parameter "text" is required' });
    }

    if (text.length > 100) {
      return res.status(400).json({ status: false, error: 'Maksimal 100 karakter kack!' });
    }

    try {
      const colorInput = req.query.color || req.body?.color || 'black';
      const username = req.query.username || req.query.user || req.body?.username || req.body?.user || 'User';
      const avatarUrl = req.query.avatar || req.body?.avatar || 'https://files.catbox.moe/nwvkbt.png';

      const backgroundColor = colors[colorInput.toLowerCase()] || colors.black;

      const json = {
          type: 'quote',
          format: 'png',
          backgroundColor,
          width: 512,
          height: 768,
          scale: 2,
          messages: [{
              entities: [],
              avatar: true,
              from: {
                  id: 1,
                  name: username,
                  photo: {
                      url: avatarUrl
                  }
              },
              text: text,
              replyMessage: {}
          }]
      };

      let imageB64 = '';
      try {
        const response = await axios.post('https://quote.yuri.ly/generate', json, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        imageB64 = response.data?.result?.image;
      } catch (e) {
        // Fallback to bot.lyo.su
        const response = await axios.post('https://bot.lyo.su/quote/generate', json, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        imageB64 = response.data?.result?.image;
      }

      if (!imageB64) {
          return res.status(500).json({ status: false, error: 'Gagal membuat gambar dari Quote API' });
      }

      const buffer = Buffer.from(imageB64, 'base64');

      const wantJson = req.query.json === 'true' || req.body?.json === true;
      if (wantJson) {
        return res.status(200).json({
          status: true,
          result: `data:image/png;base64,${imageB64}`
        });
      } else {
        res.set('Content-Type', 'image/png');
        return res.send(buffer);
      }

    } catch (error) {
      console.error('[qc error]', error);
      return res.status(500).json({ status: false, error: error.message });
    }
  };

  app.get('/maker/qc', handleQcMaker);
  app.post('/maker/qc', handleQcMaker);
};
