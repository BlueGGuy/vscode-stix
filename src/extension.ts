'use strict';

import * as vscode from 'vscode';
import { JsonOutlineProvider } from './json/jsonOutline';

export function activate(context: vscode.ExtensionContext) {
	const jsonOutlineProvider = new JsonOutlineProvider(context);
	vscode.window.createTreeView('stixOutline', { treeDataProvider: jsonOutlineProvider, showCollapseAll: true });
	vscode.commands.registerCommand('stixOutline.refresh', () => jsonOutlineProvider.refresh());
	vscode.commands.registerCommand('stixOutline.refreshNode', offset => jsonOutlineProvider.refresh(offset));
	vscode.commands.registerCommand('stixOutline.renameNode', offset => jsonOutlineProvider.rename(offset));
	vscode.commands.registerCommand('extension.openJsonSelection', range => jsonOutlineProvider.select(range));
}
