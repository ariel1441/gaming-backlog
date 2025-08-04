// backend/config/cors.js

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [ 'https://yourdomain.com','https://www.yourdomain.com',]: 
  ['http://localhost:5173','http://127.0.0.1:5173',];

const corsOptions = {
  origin: function (origin, callback) {
    // if (!origin && process.env.NODE_ENV !== 'production') {
    //   return callback(null, true);
    // }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
    }
  },
  credentials: true,  // Allow cookies if used in the future
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH','OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
  ],
  exposedHeaders: ['X-Total-Count'],  // In case you paginate
  maxAge: 86400,  // Cache CORS preflight for 24 hours
};

export default corsOptions;
