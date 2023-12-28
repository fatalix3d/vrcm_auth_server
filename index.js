const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Инициализация базы данных
const db = new sqlite3.Database('tokens.db');

// Предопределенные токены
const predefinedTokens = ['token1', 'token2', 'token3', 'token4', 'token5'];

// Создание таблицы tokens, если её нет
db.run(`
  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    expiry TEXT,
    isValid BOOLEAN,
    deviceId TEXT
  )
`, (err) => {
  if (err) {
    console.error(`Error creating table: ${err}`);
  } else {
    // Инициализация токенов в базе данных
    predefinedTokens.forEach(token => {
      db.run('INSERT OR IGNORE INTO tokens (token, expiry, isValid, deviceId) VALUES (?, ?, ?, ?)', [token, calculateExpiryDate(), true, null], (err) => {
        if (err) {
          console.error(`Error initializing token ${token}: ${err}`);
        } else {
          db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
            if (err) {
              console.error(`Error fetching token details for logging: ${err}`);
            } else {
              console.log(`Token ${token} initialized. Token details:`, row);
            }
          });
        }
      });
    });
  }
});
 

app.use(express.json());

app.get('/api/token', (req, res) => {
  const { token, deviceID } = req.query;

  if (!token || !deviceID) {
    return res.status(400).json({ error: 'Missing token or deviceID parameter' });
  }

  if (!predefinedTokens.includes(token)) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    // Проверяем, свободен ли deviceID
    if (!row.deviceId || row.deviceId === deviceID) {
      // Если deviceID свободен или совпадает с переданным, обновляем запись в базе данных
      db.run('UPDATE tokens SET deviceId = ?, isValid = 1 WHERE token = ?', [deviceID, token], (err) => {
        if (err) {
          console.error(`Error updating deviceId for token ${token}: ${err}`);
          return res.status(500).json({ error: 'Internal Server Error' });
        }
        console.log(`DeviceID ${deviceID} assigned to token ${token}`);
        return res.json({ Token: token, Expiry: row.expiry, IsValid: true, DeviceId: deviceID });
      });
    } else {
      // Если deviceID уже занят, возвращаем токен с флагом isValid = true
      console.log(`DeviceID is already in use for token ${token}`);
      return res.json({ Token: token, Expiry: row.expiry, IsValid: true, DeviceId: row.deviceId });
    }
  });
});

function calculateExpiryDate() {
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 5);
  return expiryDate.toISOString().split('T')[0];
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
