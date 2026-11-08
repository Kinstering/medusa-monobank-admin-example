import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

// Без аннотации пустой литерал выводится как never[], и любой push не проходит
// проверку типов.
const modules: { resolve: string; options?: Record<string, unknown> }[] = [];

// Отзывы о товарах: своя таблица, заполняется из админки (виджет на странице товара).
modules.push({ resolve: "./src/modules/reviews" });

// Приём оплаты. Без токена провайдер не регистрируется — и тогда витрине
// нечем оплатить корзину, а значит заказ не создастся. Это намеренно: тихий
// откат на встроенную заглушку pp_system_default означал бы бесплатные заказы.
if (process.env.MONOBANK_TOKEN) {
	modules.push({
		resolve: "@medusajs/medusa/payment",
		options: {
			providers: [
				{
					resolve: "./src/modules/monobank",
					id: "monobank",
					options: {
						token: process.env.MONOBANK_TOKEN,
						backendUrl: process.env.MEDUSA_BACKEND_URL,
						redirectUrl: process.env.MONOBANK_REDIRECT_URL,
					},
				},
			],
		},
	});
}

/** Потолок одной загрузки; тем же числом ограничен приём в API (src/api/middlewares.ts). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

module.exports = defineConfig({
	projectConfig: {
		databaseUrl: process.env.DATABASE_URL,
		// Пул knex общий на все модули. Дефолтного max=10 не хватает: миграции
		// ~30 модулей идут параллельно и упираются в "Timeout acquiring a connection".
		// Внимание: pool читается из корня databaseDriverOptions, а не из connection.
		databaseDriverOptions: {
			pool: {
				min: 0,
				max: Number(process.env.DATABASE_POOL_MAX ?? 30),
			},
		},
		http: {
			storeCors: process.env.STORE_CORS!,
			adminCors: process.env.ADMIN_CORS!,
			authCors: process.env.AUTH_CORS!,
			jwtSecret: process.env.JWT_SECRET,
			cookieSecret: process.env.COOKIE_SECRET,
		},
	},

	modules,

	admin: {
		// Дашборд по умолчанию не принимает файлы больше 1 МБ — меньше одного фото товара.
		maxUploadFileSize: MAX_UPLOAD_BYTES,

		// Возвращаются только изменения: admin-bundler сам делает
		// mergeConfig(baseConfig, это). Если вернуть ...config, плагины Vite
		// (и react-refresh) попадут в итог дважды, и любой свой .tsx-виджет
		// упадёт при сборке с «$RefreshReg$ has already been declared».
		vite: () => ({
			optimizeDeps: {
				esbuildOptions: {
					// maxUploadFileSize — build-time define, который в `medusa develop`
					// не доходит до пребандленного дашборда. Так dev-сервер тоже его видит.
					define: {
						__MAX_UPLOAD_FILE_SIZE__: String(MAX_UPLOAD_BYTES),
					},
				},
			},
		}),
	},
});
