const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(',').map((s) => s.trim()), credentials: false }));
app.use(express.json({ limit: '2mb' }));
if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'EliteSuraksha 2.0 API — gig-worker earnings intelligence with persistent agent memory' });
});

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
