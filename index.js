const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Инициализация базы данных
const db = new sqlite3.Database('tokens.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      expiry TEXT,
      isValid BOOLEAN,
      deviceId TEXT,
      maxUsers INT,
      videoLinks TEXT DEFAULT '[]',
      videoFileNames TEXT DEFAULT '[]'
    )
  `, (err) => {
    if (err) {
      console.error(`Error creating table: ${err}`);
    } else {
      console.log('Table created or already exists');
      
      // Проверяем, существуют ли столбцы videoLinks и videoFileNames
      db.all("PRAGMA table_info(tokens)", (err, rows) => {
        if (err) {
          console.error(`Error checking table structure: ${err}`);
        } else {
          const hasVideoLinks = rows.some(row => row.name === 'videoLinks');
          const hasVideoFileNames = rows.some(row => row.name === 'videoFileNames');

          if (!hasVideoLinks) {
            db.run('ALTER TABLE tokens ADD COLUMN videoLinks TEXT DEFAULT "[]"', (err) => {
              if (err) {
                console.error(`Error adding videoLinks column: ${err}`);
              } else {
                console.log('VideoLinks column added successfully');
              }
            });
          }

          if (!hasVideoFileNames) {
            db.run('ALTER TABLE tokens ADD COLUMN videoFileNames TEXT DEFAULT "[]"', (err) => {
              if (err) {
                console.error(`Error adding videoFileNames column: ${err}`);
              } else {
                console.log('VideoFileNames column added successfully');
              }
            });
          }
        }
      });

      // Проверяем, есть ли уже токены в базе данных
      db.all('SELECT * FROM tokens', (err, rows) => {
        if (err) {
          console.error(`Error checking tokens: ${err}`);
        } else if (rows.length === 0) {
          // Если база данных пуста, добавляем новые токены
          const initialTokens = [
            { 
              token: 'NSB897sb64cX', 
              expiry: calculateExpiryDate(), 
              isValid: true, 
              deviceId: null, 
              maxUsers: 10, 
              videoLinks: '[]',
              videoFileNames: '[]'
            },
            // Другие токены...
          ];

          const stmt = db.prepare('INSERT INTO tokens (token, expiry, isValid, deviceId, maxUsers, videoLinks, videoFileNames) VALUES (?, ?, ?, ?, ?, ?, ?)');
          
          initialTokens.forEach(({ token, expiry, isValid, deviceId, maxUsers, videoLinks, videoFileNames }) => {
            stmt.run(token, expiry, isValid, deviceId, maxUsers, videoLinks, videoFileNames, (err) => {
              if (err) {
                console.error(`Error initializing token ${token}: ${err}`);
              } else {
                console.log(`Token ${token} initialized.`);
              }
            });
          });

          stmt.finalize();
        } else {
          console.log('Tokens already initialized.');
        }
      });
    }
  });
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

    if (!row) {
      return res.status(404).json({ error: 'Token not found' });
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
        
        // Парсим JSON-строки с видеоссылками и именами файлов
        let videoLinks = [];
        let videoFileNames = [];
        try {
          videoLinks = JSON.parse(row.videoLinks || '[]');
          videoFileNames = JSON.parse(row.videoFileNames || '[]');
        } catch (e) {
          console.error(`Error parsing videoLinks or videoFileNames for token ${token}: ${e}`);
        }

        // Создаем объект VideoInfo
        const videoInfo = videoLinks.map((link, index) => ({
          link: link,
          fileName: videoFileNames[index] || null
        }));

        return res.json({ 
          Token: row.token,
          Expiry: row.expiry,
          IsValid: row.isValid,
          DeviceId: deviceID,
          MaxUsers: row.maxUsers,
          VideoInfo: videoInfo
        });
      });
    } else {
      // Если deviceID уже занят, возвращаем токен с флагом isValid = false
      console.log(`DeviceID is already in use for token ${token}`);

      // Парсим JSON-строки с видеоссылками и именами файлов
      let videoLinks = [];
      let videoFileNames = [];
      try {
        videoLinks = JSON.parse(row.videoLinks || '[]');
        videoFileNames = JSON.parse(row.videoFileNames || '[]');
      } catch (e) {
        console.error(`Error parsing videoLinks or videoFileNames for token ${token}: ${e}`);
      }

      // Создаем объект VideoInfo
      const videoInfo = videoLinks.map((link, index) => ({
        link: link,
        fileName: videoFileNames[index] || null
      }));

      return res.json({ 
        Token: token,
        Expiry: row.expiry,
        IsValid: false,
        DeviceId: row.deviceId,
        MaxUsers: row.maxUsers,
        VideoInfo: videoInfo
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

    // Парсим JSON-строки с видеоссылками и именами файлов
    let videoLinks = [];
    let videoFileNames = [];
    try {
      videoLinks = JSON.parse(row.videoLinks || '[]');
      videoFileNames = JSON.parse(row.videoFileNames || '[]');
    } catch (e) {
      console.error(`Error parsing videoLinks or videoFileNames for token ${token}: ${e}`);
    }

    // Создаем объект, объединяющий ссылки и имена файлов
    const videoInfo = videoLinks.map((link, index) => ({
      link: link,
      fileName: videoFileNames[index] || null
    }));

    return res.json({ 
      Token: row.token,
      Expiry: row.expiry,
      IsValid: row.isValid,
      DeviceId: row.deviceId,
      MaxUsers: row.maxUsers,
      VideoInfo: videoInfo
    });
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

    // Добавляем новый токен в базу данных с учетом maxUsers и пустыми массивами для videoLinks и videoFileNames
    db.run('INSERT INTO tokens (token, expiry, isValid, deviceId, maxUsers, videoLinks, videoFileNames) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newToken, expiryDate, true, null, maxUsers, '[]', '[]'], (err) => {
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
          VideoInfo: []
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

// Update all parameters for a token
app.post('/api/token/updateAll', (req, res) => {
  const { token, expiryDate, isValid, deviceId, maxUsers } = req.body;

  if (!token || !expiryDate || isValid === undefined || maxUsers === undefined) {
    return res.status(400).json({ error: 'Missing token, expiryDate, isValid, or maxUsers parameter' });
  }

  db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
    if (err) {
      console.error(`Error checking existing token ${token}: ${err}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Обновляем все параметры для существующего токена
    db.run('UPDATE tokens SET expiry = ?, isValid = ?, deviceId = ?, maxUsers = ? WHERE token = ?',
      [expiryDate, isValid, deviceId, maxUsers, token], (err) => {
        if (err) {
          console.error(`Error updating parameters for token ${token}: ${err}`);
          return res.status(500).json({ error: 'Internal Server Error' });
        }

        console.log(`Parameters for token ${token} updated`);
        
        // Возвращаем обновленные параметры в ответе
        return res.json({
          Token: token,
          Expiry: expiryDate,
          IsValid: isValid,
          DeviceId: deviceId,
          MaxUsers: maxUsers,
        });
      });
  });
});

// Update video links and file names for a token
app.post('/api/token/update-video-info', (req, res) => {
  const { token, videoInfo } = req.body;

  if (!token || !videoInfo) {
    return res.status(400).json({ error: 'Missing token or videoInfo in request body' });
  }

  // Проверяем, является ли videoInfo массивом
  if (!Array.isArray(videoInfo)) {
    return res.status(400).json({ error: 'videoInfo must be an array' });
  }

  // Разделяем videoInfo на videoLinks и videoFileNames
  const videoLinks = videoInfo.map(item => item.link);
  const videoFileNames = videoInfo.map(item => item.fileName);

  // Преобразуем массивы в JSON-строки
  const videoLinksJson = JSON.stringify(videoLinks);
  const videoFileNamesJson = JSON.stringify(videoFileNames);

  db.get('SELECT * FROM tokens WHERE token = ?', [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Обновляем videoLinks и videoFileNames для данного токена
    db.run('UPDATE tokens SET videoLinks = ?, videoFileNames = ? WHERE token = ?', [videoLinksJson, videoFileNamesJson, token], (err) => {
      if (err) {
        console.error(`Error updating video info for token ${token}: ${err}`);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      console.log(`Video info updated for token ${token}`);

      return res.json({ 
        message: 'Video info updated successfully',
        Token: token,
        VideoInfo: videoInfo
      });
    });
  });
});

// Год, месяц, день
function calculateExpiryDate() {
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 5);
  return expiryDate.toISOString().split('T')[0];
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});