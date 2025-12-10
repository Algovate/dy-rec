import chalk from 'chalk';

export class Logger {
    private static isVerbose = false;

    static setVerbose(verbose: boolean): void {
        this.isVerbose = verbose;
    }

    static info(message: string, ...args: unknown[]): void {
        console.log(chalk.cyan(message), ...args);
    }

    static success(message: string, ...args: unknown[]): void {
        console.log(chalk.green(message), ...args);
    }

    static warn(message: string, ...args: unknown[]): void {
        console.log(chalk.yellow(message), ...args);
    }

    static error(message: string, ...args: unknown[]): void {
        console.error(chalk.red(message), ...args);
    }

    static log(message: string, ...args: unknown[]): void {
        console.log(message, ...args);
    }

    static gray(message: string, ...args: unknown[]): void {
        console.log(chalk.gray(message), ...args);
    }

    /**
     * Only prints if verbose mode is enabled
     */
    static verbose(message: string, ...args: unknown[]): void {
        if (this.isVerbose) {
            console.log(chalk.gray(`[Verbose] ${message}`), ...args);
        }
    }

    /**
     * Prints debug info (same as verbose but with different prefix if needed, currently alias)
     */
    static debug(message: string, ...args: unknown[]): void {
        if (this.isVerbose) {
            console.log(chalk.magenta(`[Debug] ${message}`), ...args);
        }
    }
}
