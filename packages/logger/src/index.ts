export type LogFields = Record<string, unknown>;

export type Logger = {
	info: (message: string, fields?: LogFields) => void;
	error: (message: string, fields?: LogFields) => void;
	child: (fields: LogFields) => Logger;
};

export function createLogger(bound: LogFields = {}): Logger {
	const write = (
		level: "info" | "error",
		message: string,
		fields?: LogFields,
	) => {
		console.log(JSON.stringify({ level, message, ...bound, ...fields }));
	};
	return {
		info: (message, fields) => write("info", message, fields),
		error: (message, fields) => write("error", message, fields),
		child: (fields) => createLogger({ ...bound, ...fields }),
	};
}
