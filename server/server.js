require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const db = require('./db');
const auth = require('./auth');
const { router: routes, hasPlayerAccess } = require('./routes'); // Импортируем hasPlayerAccess

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware авторизации
const authMiddleware = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    jwt.verify(token, process.env.SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Неверный токен' });
        req.user = decoded;
        next();
    });
};

// Middleware для проверки роли администратора
const isAdmin = (req, res, next) => {
    if (req.user?.role === 'admin') {
        next();
    } else {
        res.status(403).send('Доступ запрещён');
    }
};

// Обработка HTML-страниц
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../client/public/login.html')));
app.get('/welcome', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, '../client/public/welcome.html')));
app.get('/player', authMiddleware, hasPlayerAccess, (req, res) => res.sendFile(path.join(__dirname, '../client/public/player.html')));
app.get('/admin', authMiddleware, isAdmin, (req, res) => res.sendFile(path.join(__dirname, '../client/admin.html')));

// Маршруты API
app.use('/api', routes);

// Статические файлы
app.use(express.static(path.join(__dirname, '../client/public')));
app.use(express.static(path.join(__dirname, '../client')));

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));