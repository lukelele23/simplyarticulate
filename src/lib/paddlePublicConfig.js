// Explicit public fields only: never spread all environment variables into client code.
export const paddlePublicConfig={
 VITE_PADDLE_ENVIRONMENT:import.meta.env.VITE_PADDLE_ENVIRONMENT,
 VITE_PADDLE_CLIENT_TOKEN:import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
 VITE_PADDLE_PRO_MONTH_PRICE_ID:import.meta.env.VITE_PADDLE_PRO_MONTH_PRICE_ID,
 VITE_PADDLE_PRO_YEAR_PRICE_ID:import.meta.env.VITE_PADDLE_PRO_YEAR_PRICE_ID,
};
