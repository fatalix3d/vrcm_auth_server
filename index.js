const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Инициализация базы данных
const db = new sqlite3.Database('tokens.db');

// Создание таблицы tokens, если её нет
// Создание таблицы tokens, если её нет
db.run(`
  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    expiry TEXT,
    isValid BOOLEAN,
    deviceId TEXT,
    maxUsers INT
  )
`, (err) => {
  if (err) {
    console.error(`Error creating table: ${err}`);
  } else {
    // Инициализация токенов в базе данных
    db.all('SELECT * FROM tokens', (err, rows) => {
      if (err) {
        console.error(`Error initializing tokens: ${err}`);
      } else {
        if (rows.length === 0) {
          // Если база данных пуста, добавляем новые токены
          const initialTokens = [
            { token: 'NSB897sb64cX', expiry: calculateExpiryDate(), isValid: true, deviceId: null, maxUsers: 10 },
            // Другие токены...
          ];

          initialTokens.forEach(({ token, expiry, isValid, deviceId, maxUsers }) => {
            db.run('INSERT INTO tokens (token, expiry, isValid, deviceId, maxUsers) VALUES (?, ?, ?, ?, ?)',
              [token, expiry, isValid, deviceId, maxUsers], (err) => {
                if (err) {
                  console.error(`Error initializing token ${token}: ${err}`);
                } else {
                  console.log(`Token ${token} initialized.`);
                }
              });
          });
        } else {
          console.log('Tokens already initialized.');
        }
      }
    });
  }
});


app.use(express.json());

// Login
app.get('/api/token', (req, res) => {
  const { token, deviceID } = req.query;

  if (!token || !deviceID) {
    return res.status(400).json({ error: 'Missing token or deviceID parameter' });
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
        return res.json({ 
          Token: row.token,
          Expiry: row.expiry,
          IsValid: row.isValid,
          DeviceId: deviceID,
          MaxUsers: row.maxUsers
          });
      });
    } else {
      // Если deviceID уже занят, возвращаем токен с флагом isValid = false
      console.log(`DeviceID is already in use for token ${token}`);
      return res.json({ 
        Token: token,
        Expiry: row.expiry,
        IsValid: false,
        DeviceId: row.deviceId,
        MaxUsers: row.maxUsers
      });
    }
  });
});

// Token status
app.get('/api/token/status', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Missing token parameter' });
  }

  db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Token not found' });
    }

    return res.json({ 
      Token: row.token,
      Expiry: row.expiry,
      IsValid: row.isValid,
      DeviceId: row.deviceId,
      MaxUsers: row.maxUsers
    });
    // if (row.deviceId) {
    //   return res.json({ Token: token, Status: 'Occupied', DeviceId: row.deviceId, MaxUsers : row.maxUsers});
    // } else {
    //   return res.json({ Token: token, Status: 'Free', MaxUsers : row.maxUsers });
    // }
  });
});

// Add token
app.post('/api/token/add', (req, res) => {
  const { newToken, expiryDate, maxUsers } = req.body;

  if (!newToken || !expiryDate || maxUsers === undefined) {
    return res.status(400).json({ error: 'Missing newToken, expiryDate, or maxUsers parameter' });
  }

  db.get('SELECT * FROM tokens WHERE token = ?', [newToken], (err, row) => {
    if (err) {
      console.error(`Error checking existing token ${newToken}: ${err}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (row) {
      return res.status(400).json({ error: 'Token already exists' });
    }

    // Добавляем новый токен в базу данных с учетом maxUsers
    db.run('INSERT INTO tokens (token, expiry, isValid, deviceId, maxUsers) VALUES (?, ?, ?, ?, ?)',
      [newToken, expiryDate, true, null, maxUsers], (err) => {
        if (err) {
          console.error(`Error adding new token ${newToken}: ${err}`);
          return res.status(500).json({ error: 'Internal Server Error' });
        }

        console.log(`New token ${newToken} added with expiry date ${expiryDate} and maxUsers ${maxUsers}`);
        
        // Возвращаем maxUsers в ответе
        return res.json({
          Token: newToken,
          Expiry: expiryDate,
          IsValid: true,
          MaxUsers: maxUsers,
        });
      });
  });
});

// Update maxUsers for a token
app.post('/api/token/updateMaxUsers', (req, res) => {
  const { token, maxUsers } = req.body;

  if (!token || maxUsers === undefined) {
    return res.status(400).json({ error: 'Missing token or maxUsers parameter' });
  }

  db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
    if (err) {
      console.error(`Error checking existing token ${token}: ${err}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Обновляем maxUsers для существующего токена
    db.run('UPDATE tokens SET maxUsers = ? WHERE token = ?', [maxUsers, token], (err) => {
      if (err) {
        console.error(`Error updating maxUsers for token ${token}: ${err}`);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      console.log(`MaxUsers for token ${token} updated to ${maxUsers}`);
      
      // Возвращаем обновленный maxUsers в ответе
      return res.json({
        Token: token,
        MaxUsers: maxUsers,
      });
    });
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
