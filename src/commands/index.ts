import { Command } from "obsidian";
import ReadingViewEnhancer from "src/main";
import { COMMAND_FACTORIES } from "./commands";

export interface RveCommand {
	(plugin: ReadingViewEnhancer): Command;
}

/**
 * Set commands for plugin.
 * Loads all commands from `commands` directory and add them to plugin.
 */
export default class Commands {
	plugin: ReadingViewEnhancer;

	constructor(plugin: ReadingViewEnhancer) {
		this.plugin = plugin;
	}

	register() {
		COMMAND_FACTORIES.map((revCommand) => revCommand(this.plugin)).forEach(
			(command) => this.plugin.addCommand(command),
		);
	}
}
