const express = require('express');
const router = express.Router();
const db = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Middleware авторизации
const authMiddleware = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    console.log('authMiddleware - Token:', token);
    if (!token) {
        console.log('authMiddleware - No token found');
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    jwt.verify(token, process.env.SECRET, (err, decoded) => {
        if (err) {
            console.log('authMiddleware - Token verification failed:', err.message);
            return res.status(401).json({ error: 'Неверный токен' });
        }
        req.user = decoded;
        next();
    });
};

// Middleware для проверки админки
const isAdmin = (req, res, next) => {
    if (req.user?.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Доступ запрещён' });
    }
};

// Middleware для проверки доступа к плееру
const hasPlayerAccess = (req, res, next) => {
    db.get('SELECT access_player FROM users WHERE username = ?', [req.user.username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row.access_player === 1) {
            next();
        } else {
            res.status(403).json({ error: 'Нет доступа к плееру' });
        }
    });
};

// Маршрут для входа
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', { username, password });
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            console.log('User not found');
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (err) {
                console.error('Bcrypt error:', err.message);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!match) {
                console.log('Password mismatch');
                return res.status(401).json({ error: 'Неверный логин или пароль' });
            }

            const token = jwt.sign({ username: user.username, role: user.role }, process.env.SECRET, { expiresIn: '1h' });
            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production', 
                sameSite: 'Strict' 
            });
            console.log('Login successful, token set in cookie:', token);
            res.json({ success: true });
        });
    });
});

// Маршрут для выхода
router.post('/logout', (req, res) => {
    res.clearCookie('token', { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        sameSite: 'Strict' 
    });
    res.json({ success: true });
});

// Маршрут для получения данных текущего пользователя
router.get('/me', authMiddleware, (req, res) => {
    db.get('SELECT username, role, access_player FROM users WHERE username = ?', [req.user.username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ username: user.username, role: user.role, access_player: user.access_player });
    });
});

// Публичные маршруты
router.get('/streams', (req, res) => {
    db.all('SELECT * FROM streams', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Админские маршруты
router.get('/admin/streams', authMiddleware, isAdmin, (req, res) => {
    db.all('SELECT * FROM streams', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/admin/streams', authMiddleware, isAdmin, (req, res) => {
    const { name, url, type } = req.body;
    db.run('INSERT INTO streams (name, url, type) VALUES (?, ?, ?)', [name, url, type], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID });
    });
});

router.delete('/admin/streams/:id', authMiddleware, isAdmin, (req, res) => {
    db.run('DELETE FROM streams WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.sendStatus(204);
    });
});

router.get('/admin/check-streams', authMiddleware, isAdmin, async (req, res) => {
    try {
        const streams = await new Promise((resolve, reject) => {
            db.all('SELECT id, url FROM streams', (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        const checkStream = async (url) => {
            try {
                const response = await fetch(url, { method: 'HEAD' });
                return response.ok ? 'online' : 'offline';
            } catch {
                return 'offline';
            }
        };

        const statuses = await Promise.all(streams.map(async stream => ({
            id: stream.id,
            status: await checkStream(stream.url)
        })));

        res.json(statuses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/admin/users', authMiddleware, isAdmin, (req, res) => {
    db.all('SELECT id, username, role, access_player FROM users', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.put('/admin/users/:id', authMiddleware, isAdmin, (req, res) => {
    const { role, access_player } = req.body;
    db.run('UPDATE users SET role = ?, access_player = ? WHERE id = ?', 
        [role, access_player, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Пользователь не найден' });
            res.sendStatus(204);
        });
});

router.post('/admin/users', authMiddleware, isAdmin, async (req, res) => {
    const { username, password, role, access_player } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, role, access_player) VALUES (?, ?, ?, ?)', 
            [username, hashedPassword, role || 'user', access_player || 1], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: this.lastID });
            });
    } catch (error) {
        console.error('Ошибка хеширования:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/admin/users/:id', authMiddleware, isAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.sendStatus(204);
    });
});

module.exports = { router, hasPlayerAccess };