const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const botManager = require('./botManager');

const app = express();
const port = 80;

// IP kontrol ayarları
const IP_KORUMA_AKTIF = false; // false yaparsanız tüm IP'ler erişebilir
const IZINLI_IP = '::ffff:localhost'; // Sadece bu IP erişebilir

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// IP kontrol middleware
app.use((req, res, next) => {
  if (IP_KORUMA_AKTIF && req.ip !== IZINLI_IP) {
    return res.status(403).send('Bu siteye erişim izniniz yok.');
  }
  next();
});

// Ana sayfa: Bot listesi
app.get('/', (req, res) => {
  const ip = req.ip;
  const botlar = botManager.botlariGetir(ip);
  res.render('index', { botlar });
});

// Bot oluşturma
app.post('/bot-olustur', (req, res) => {
  const { kullaniciAdi, sunucuIP, port: portStr, versiyon } = req.body;
  const id = uuidv4();
  const ip = req.ip;

  botManager.botOlustur(id, kullaniciAdi, sunucuIP, portStr, versiyon, ip);
  res.redirect('/');
});

// Bot detay sayfası
app.get('/bot/:id', (req, res) => {
  const id = req.params.id;
  const bot = botManager.botDetay(id);

  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }

  res.render('bot', {
    bot,
    mesajlar: bot.mesajlar.map(m => m.toString())
  });
});

// Mesaj gönderme
app.post('/bot/:id/mesaj', (req, res) => {
  const id = req.params.id;
  const bot = botManager.botDetay(id);

  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }

  const mesaj = req.body.mesaj;
  botManager.mesajGonder(id, mesaj);
  res.redirect(`/bot/${id}`);
});

app.get('/api/bot/:id/messages', (req, res) => {
  const id = req.params.id;
  const bot = botManager.botDetay(id);

  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }

  res.json({ mesajlar: bot.mesajlar.map(m => m.toString()) });
});

app.post("/api/drop-items/:botId", (req, res) => {
  const botId = req.params.botId;
  const bot = botManager.botDetay(botId);

  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }

  botManager.dropAllItems(bot.kullaniciAdi);
  res.sendStatus(200);
});

// Bot durdurma ve silme
app.post('/bot/:id/durdur', (req, res) => {
  const id = req.params.id;
  const bot = botManager.botDetay(id);

  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }

  botManager.botDurdurVeSil(id);
  res.redirect('/');
});

// Sunucuyu başlat
app.listen(port, () => {
  console.log(`Bot yönetim paneli http://localhost:${port} adresinde çalışıyor.`);
});

app.post('/api/anti-afk/:botId', (req, res) => {
  const botId = req.params.botId;
  const bot = botManager.botDetay(botId);
  
  if (!bot || bot.ip !== req.ip) { // IP kontrolü
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }
  
  const { enabled } = req.body;
  if (enabled) botManager.startAntiAFK(botId);
  else botManager.stopAntiAFK(botId);
  
  res.sendStatus(200);
});

app.post('/api/auto-message/:botId', (req, res) => {
  const botId = req.params.botId;
  const bot = botManager.botDetay(botId);
  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }
  const { enabled, messages, interval } = req.body;
  if (enabled) {
    botManager.startAutoMessage(botId, { messages, interval });
  } else {
    botManager.stopAutoMessage(botId);
  }
  res.sendStatus(200);
});

app.get('/api/auto-message/:botId', (req, res) => {
  const botId = req.params.botId;
  const bot = botManager.botDetay(botId);
  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }
  const config = botManager.getAutoMessageConfig(botId);
  res.json(config);
});

app.post('/api/auto-mine/:botId', (req, res) => {
  const botId = req.params.botId;
  const bot = botManager.botDetay(botId);
  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }
  const { enabled } = req.body;
  if (enabled) botManager.startAutoMine(botId);
  else botManager.stopAutoMine(botId);
  res.sendStatus(200);
});

app.post('/api/goto/:botId', (req, res) => {
  const botId = req.params.botId;
  const bot = botManager.botDetay(botId);
  if (!bot || bot.ip !== req.ip) {
    return res.status(403).send('Bu bota erişim izniniz yok.');
  }
  const { x, y, z } = req.body;
  botManager.goto(botId, x, y, z);
  res.sendStatus(200);
});