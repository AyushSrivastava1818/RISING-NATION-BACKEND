import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`Rising Nation API server running on port ${config.PORT} [${config.NODE_ENV}]`);
});
