import morgan from 'morgan';

// Setup morgan in dev mode
export const requestLogger = morgan('dev');
