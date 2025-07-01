const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const bots = new Map();
const antiAfkIntervals = new Map();
const autoMessageIntervals = new Map();
const autoMineIntervals = new Map();

function logYaz(mesaj) {
  const tarih = new Date().toLocaleString('tr-TR');
  console.log(`[${tarih}]: ${mesaj}`);
}

function getBotByKullaniciAdi(kullaniciAdi) {
  for (const bot of bots.values()) {
    if (bot.username === kullaniciAdi || bot.metadata?.kullaniciAdi === kullaniciAdi) {
      return bot;
    }
  }
  return null;
}

function botOlustur(id, kullaniciAdi, sunucuIP, port, versiyon, ip) {
  const bot = mineflayer.createBot({
    host: sunucuIP,
    port: parseInt(port),
    username: kullaniciAdi,
    version: versiyon
  });
  bot.loadPlugin(pathfinder);

  bot.metadata = {
    id,
    kullaniciAdi,
    sunucuIP,
    port,
    versiyon,
    ip,
    durum: 'Bağlanıyor',
    mesajlar: [],
    saglik: 20, // Varsayılan tam sağlık
    aclik: 20,  // Varsayılan tam açlık
    envanter: [],
    konum: null,
    loginTime: null, // Botun giriş zamanı
    uptime: 0, // Toplam bağlı kalınan süre (ms)
    dunya: null // Dünya bilgisi
  };

  function updateStatus() {
    bot.metadata.saglik = bot.health;
    bot.metadata.aclik = bot.food;
    bot.metadata.envanter = (bot.inventory?.items() || []).map(item => ({
      name: item.name,
      count: item.count
    }));
    // Botun canlı konumunu metadata'ya ekle
    if (bot.entity && bot.entity.position) {
      bot.metadata.konum = {
        x: Math.round(bot.entity.position.x),
        y: Math.round(bot.entity.position.y),
        z: Math.round(bot.entity.position.z)
      };
    } else {
      bot.metadata.konum = null;
    }
  }

  bot.on('login', () => {
    bot.metadata.durum = 'Bağlı';
    bot.metadata.loginTime = Date.now(); // Giriş zamanını kaydet
    // Bağlantı tekrar sağlanırsa uptime devam etsin
    if (!bot.metadata.uptime) bot.metadata.uptime = 0;
    updateStatus();
  });

  const difficultyMap = { 0: 'Huzurlu', 1: 'Kolay', 2: 'Normal', 3: 'Zor' };
  const dimensionMap = {
    'minecraft:overworld': 'Overworld',
    'minecraft:the_nether': 'Nether',
    'minecraft:the_end': 'End'
  };

  function handleSpawn() {
      const game = bot.game || {};
      bot.metadata.dunya = {
          difficulty: difficultyMap[game.difficulty] || game.difficulty,
          dimension: dimensionMap[game.dimension] || game.dimension,
      };
      updateStatus();
  }

  bot.on('health', updateStatus);
  bot.on('spawn', handleSpawn);
  bot.on('physicTick', updateStatus); // fallback for regular updates
  bot.on('inventory', updateStatus);

  bot.on('end', (reason) => {
    bot.metadata.durum = 'Bağlantı Kesildi';
    // Uptime'ı duraklat
    if (bot.metadata.loginTime) {
      bot.metadata.uptime = (bot.metadata.uptime || 0) + (Date.now() - bot.metadata.loginTime);
      bot.metadata.loginTime = null;
    }
    logYaz(`${kullaniciAdi} adlı botun bağlantısı kesildi`);
  });

  bot.on('error', (err) => {
    bot.metadata.durum = 'Hata';
    bot.metadata.hata = err.message;
    logYaz(`${kullaniciAdi} adlı botta hata oluştu: ${err.message}`);
  });

  bot.on('message', (message) => {
    bot.metadata.mesajlar.push(message.toString());
    if (bot.metadata.mesajlar.length > 50) {
      bot.metadata.mesajlar.shift();
    }
  });

  bots.set(id, bot);
}

function botlariGetir(ip) {
  const sonuc = [];
  bots.forEach((bot, id) => {
    if (bot.metadata.ip === ip) {
      sonuc.push({
        id: id,
        kullaniciAdi: bot.metadata.kullaniciAdi,
        durum: bot.metadata.durum
      });
    }
  });
  return sonuc;
}

function botDetay(id) {
  const bot = bots.get(id);
  if (!bot) return null;
  return bot.metadata;
}

function mesajGonder(id, mesaj) {
  const bot = bots.get(id);
  if (bot && typeof bot.chat === 'function') {
    try {
      bot.chat(mesaj);
    } catch (err) {
      logYaz(`${bot.metadata.kullaniciAdi} adlı botta mesaj gönderilirken hata oluştu: ${err.message}`);
    }
  } else {
    logYaz(`Bot bulunamadı ya da chat fonksiyonu geçersiz: ${id}`);
  }
}

function botDurdurVeSil(id) {
  const bot = bots.get(id);
  if (bot) {
    const kullaniciAdi = bot.metadata.kullaniciAdi;
    logYaz(`${kullaniciAdi} adlı bot silindi.`);
    bot.end();
    bots.delete(id);
  }
}

function startAntiAFK(botId) {
  const bot = bots.get(botId);
  if (!bot || antiAfkIntervals.has(botId)) return;

  const interval = setInterval(() => {
    try {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 200);
    } catch (e) {
      console.error("Jump error:", e);
    }
  }, 3000);

  antiAfkIntervals.set(botId, interval);
  logYaz(`${bot.metadata.kullaniciAdi} için Anti-AFK başlatıldı.`);
}

function stopAntiAFK(botId) {
  const bot = bots.get(botId);
  if (antiAfkIntervals.has(botId)) {
    clearInterval(antiAfkIntervals.get(botId));
    antiAfkIntervals.delete(botId);
    logYaz(`${bot.metadata.kullaniciAdi} için Anti-AFK durduruldu.`);
  }
}

function dropAllItems(kullaniciAdi) {
  const bot = getBotByKullaniciAdi(kullaniciAdi);
  if (!bot) {
    logYaz("Bot bulunamadı: " + kullaniciAdi);
    return;
  }

const items = bot.inventory?.items() || [];
logYaz(`${kullaniciAdi} adlı bottan ${items.length} eşya bırakıldı.`);

(async () => {
  for (const item of items) {
    try {
      await bot.tossStack(item);
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
    }
  }
})();
}

function startAutoMessage(botId, config) {
  const bot = bots.get(botId);
  if (!bot) return;
  stopAutoMessage(botId);
  if (!config || !Array.isArray(config.messages) || config.messages.length === 0 || !config.interval) return;

  let lastMsg = null;
  const sendRandomMessage = () => {
    let msg;
    const available = config.messages.length > 1
      ? config.messages.filter(m => m !== lastMsg)
      : config.messages;
    msg = available[Math.floor(Math.random() * available.length)];
    if (msg && typeof bot.chat === 'function') {
      try { bot.chat(msg); lastMsg = msg; } catch (e) { logYaz(`${bot.metadata.kullaniciAdi} için oto mesaj hatası: ${e.message}`); }
    }
  };
  const intervalId = setInterval(sendRandomMessage, config.interval * 1000);
  autoMessageIntervals.set(botId, { intervalId, config });
  logYaz(`${bot.metadata.kullaniciAdi} için Oto Mesaj başlatıldı.`);
}

function stopAutoMessage(botId) {
  const bot = bots.get(botId);
  const entry = autoMessageIntervals.get(botId);
  if (entry) {
    clearInterval(entry.intervalId);
    autoMessageIntervals.delete(botId);
    logYaz(`${bot.metadata.kullaniciAdi} için Oto Mesaj durduruldu.`);
  }
}

function getAutoMessageConfig(botId) {
  const entry = autoMessageIntervals.get(botId);
  if (entry) return { ...entry.config, enabled: true };
  return { messages: [], interval: 10, enabled: false };
}

function startAutoMine(botId) {
  const bot = bots.get(botId);
  if (!bot || autoMineIntervals.has(botId)) return;

  const interval = setInterval(async () => {
    try {
      const block = bot.blockAtCursor(5);
      if (!block) return;
      // Uygun eşya bul ve eline al
      let toolNames = [];
      if (block.name.includes('log') || block.name.includes('wood')) {
        toolNames = ['diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe', 'golden_axe'];
      } else if (block.name.includes('dirt') || block.name.includes('sand') || block.name.includes('gravel') || block.name.includes('grass')) {
        toolNames = ['diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel', 'golden_shovel'];
      } else {
        toolNames = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe', 'golden_pickaxe'];
      }
      const item = bot.inventory.items().find(i => toolNames.includes(i.name));
      if (item) {
        await bot.equip(item, 'hand');
      }
      await bot.dig(block);
    } catch (e) {
      // Kazma işlemi başarısız olabilir, hata bastırılır
    }
  }, 2000); // Her 2 saniyede bir kazma denemesi

  autoMineIntervals.set(botId, interval);
  logYaz(`${bot.metadata.kullaniciAdi} için Oto Kazma başlatıldı.`);
}

function stopAutoMine(botId) {
  if (autoMineIntervals.has(botId)) {
    clearInterval(autoMineIntervals.get(botId));
    autoMineIntervals.delete(botId);
    const bot = bots.get(botId);
    if (bot) logYaz(`${bot.metadata.kullaniciAdi} için Oto Kazma durduruldu.`);
  }
}

function goto(botId, x, y, z) {
  const bot = bots.get(botId);
  if (!bot) return;
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);
  bot.pathfinder.setGoal(new GoalBlock(x, y, z));
}

module.exports = {
  botOlustur,
  botlariGetir,
  botDetay,
  mesajGonder,
  botDurdurVeSil,
  startAntiAFK,
  stopAntiAFK,
  dropAllItems,
  getBotByKullaniciAdi,
  startAutoMessage,
  stopAutoMessage,
  getAutoMessageConfig,
  startAutoMine,
  stopAutoMine,
  goto
};
