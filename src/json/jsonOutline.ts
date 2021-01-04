import * as vscode from 'vscode';
import * as json from 'jsonc-parser';
import * as path from 'path';
import * as fs from 'fs';

export class JsonOutlineProvider implements vscode.TreeDataProvider<number> {

	private _onDidChangeTreeData: vscode.EventEmitter<number | null> = new vscode.EventEmitter<number | null>();
	readonly onDidChangeTreeData: vscode.Event<number | null> = this._onDidChangeTreeData.event;

	private tree: json.Node;
	private text: string;
	private editor: vscode.TextEditor;
	private autoRefresh = true;

	constructor(private context: vscode.ExtensionContext) {
		vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
		vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
		this.parseTree();
		this.autoRefresh = vscode.workspace.getConfiguration('JSON-stix.json').get('autorefresh');
		vscode.workspace.onDidChangeConfiguration(() => {
			this.autoRefresh = vscode.workspace.getConfiguration('JSON-stix.json').get('autorefresh');
		});
		this.onActiveEditorChanged();
	}

	refresh(offset?: number): void {
		this.parseTree();
		if (offset) {
			this._onDidChangeTreeData.fire(offset);
		} else {
			this._onDidChangeTreeData.fire(undefined);
		}
	}

	rename(offset: number): void {
		vscode.window.showInputBox({ placeHolder: 'Enter the new label' })
			.then(value => {
				if (value !== null && value !== undefined) {
					this.editor.edit(editBuilder => {
						const path = json.getLocation(this.text, offset).path;
						let propertyNode = json.findNodeAtLocation(this.tree, path);
						if (propertyNode.parent.type !== 'array') {
							propertyNode = propertyNode.parent.children[0];
						}
						const range = new vscode.Range(this.editor.document.positionAt(propertyNode.offset), this.editor.document.positionAt(propertyNode.offset + propertyNode.length));
						editBuilder.replace(range, `"${value}"`);
						setTimeout(() => {
							this.parseTree();
							this.refresh(offset);
						}, 100);
					});
				}
			});
	}

	private onActiveEditorChanged(): void {
		if (vscode.window.activeTextEditor) {
			if (vscode.window.activeTextEditor.document.uri.scheme === 'file') {
				const enabled = vscode.window.activeTextEditor.document.languageId === 'json' || vscode.window.activeTextEditor.document.languageId === 'jsonc';
				vscode.commands.executeCommand('setContext', 'jsonOutlineEnabled', enabled);
				// if (enabled) {
				// 	this.refresh();
				// }
			}
		} else {
			vscode.commands.executeCommand('setContext', 'jsonOutlineEnabled', false);
		}
		// 切换文件，刷新
		this.refresh();
	}

	private onDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
		if (this.autoRefresh && changeEvent.document.uri.toString() === this.editor.document.uri.toString()) {
			for (const change of changeEvent.contentChanges) {
				const path = json.getLocation(this.text, this.editor.document.offsetAt(change.range.start)).path;
				path.pop();
				const node = path.length ? json.findNodeAtLocation(this.tree, path) : void 0;
				this.parseTree();
				this._onDidChangeTreeData.fire(node ? node.offset : void 0);
			}
		}
	}

	private parseTree(): void {
		this.text = '';
		this.tree = null;
		this.editor = vscode.window.activeTextEditor;
		if (this.editor && this.editor.document) {
			this.text = this.editor.document.getText();
			this.tree = json.parseTree(this.text);
		}
	}

	getChildren(offset?: number): Thenable<number[]> {
		if (offset) {
			const path = json.getLocation(this.text, offset).path;
			const node = json.findNodeAtLocation(this.tree, path);
			return Promise.resolve(this.getChildrenOffsets(node));
		} else {
			return Promise.resolve(this.tree ? this.getChildrenOffsets(this.tree) : []);
		}
	}

	private getChildrenOffsets(node: json.Node): number[] {
		const offsets: number[] = [];
		if (node && node.children) {
			for (const child of node.children) {
				const childPath = json.getLocation(this.text, child.offset).path;
				const childNode = json.findNodeAtLocation(this.tree, childPath);
				if (childNode) {
					offsets.push(childNode.offset);
				}
			}
		}
		return offsets;
	}

	getTreeItem(offset: number): vscode.TreeItem {
		const path = json.getLocation(this.text, offset).path;
		const valueNode = json.findNodeAtLocation(this.tree, path);
		if (valueNode) {
			let state = vscode.TreeItemCollapsibleState.None;
			if (valueNode.type === 'object') {
				state = vscode.TreeItemCollapsibleState.Expanded;
			}
			else if (valueNode.type === 'array') {
				if (valueNode.children.length === 1) {
					state = vscode.TreeItemCollapsibleState.Expanded;
				}
				else {
					state = vscode.TreeItemCollapsibleState.Collapsed;
				}
			}
			const xlabel = this.getLabel(valueNode);
			const treeItem: vscode.TreeItem = new vscode.TreeItem(xlabel.label, state);
			treeItem.command = {
				command: 'extension.openJsonSelection',
				title: '',
				arguments: [new vscode.Range(this.editor.document.positionAt(valueNode.offset), this.editor.document.positionAt(valueNode.offset + valueNode.length))]
			};
			treeItem.iconPath = this.getIcon(valueNode);
			treeItem.contextValue = valueNode.type;
			return treeItem;
		}
		return null;
	}

	select(range: vscode.Range) {
		this.editor.selection = new vscode.Selection(range.start, range.end);
		// 编辑窗跳转到指定范围
        this.editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	}

	getStixType(node: json.Node): string {
		const children = node.children;
		if(children) {
			const type = children.find( x => x.type == 'property' && x.children[0].value == "type" );
			if(type) {
				return type.children[1].value;
			}
		}
		return null;
	}

	/*getStixID(node: json.Node): string {
		const children = node.children;
		if(children) {
			children.find();//FIND ID PROPERTY
			const child = children[1];
			if(child && child.type == 'property') {
				const value = child.children[1].value;
				return value;
			}
		}
		return null;
	}*/

	private getIcon(node: json.Node): any {
		const stype = this.getStixType(node);
		if(stype) {
			let x = {
				light: this.context.asAbsolutePath(path.join('resources', 'stix', stype + '-round-flat-300-dpi.png')),
				dark: this.context.asAbsolutePath(path.join('resources', 'stix', stype + '-round-flat-300-dpi.png'))	
			};
			if (!fs.existsSync(x.dark)) {
				x.dark = x.light;
			}
			if (!fs.existsSync(x.dark)) {
				x = {
					light: this.context.asAbsolutePath(path.join('resources', 'stix', 'x-round-flat-300-dpi.png')),
					dark: this.context.asAbsolutePath(path.join('resources', 'stix', 'x-round-flat-300-dpi.png'))	
				};
			}
			return x;
		}

		/*if(node.type == 'property') {
			if(node.children[0].value == 'source_ref') {
				const bundle = node.parent.parent; //FIXME
				const bchildren = bundle.children;
				bchildren.reduce((x,y) => if() { return x } else { })
			}
		}*/
		
		const nodeType = node.type;

		if (nodeType === 'boolean') {
			return {
				light: this.context.asAbsolutePath(path.join('resources', 'light', 'boolean.svg')),
				dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'boolean.svg'))
			};
		}
		if (nodeType === 'string') {
			return {
				light: this.context.asAbsolutePath(path.join('resources', 'light', 'string.svg')),
				dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'string.svg'))
			};
		}
		if (nodeType === 'number') {
			return {
				light: this.context.asAbsolutePath(path.join('resources', 'light', 'number.svg')),
				dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'number.svg'))
			};
		}
		return null;
	}

	private getLabel(node: json.Node) {
		let s = "";
		let hl = [];
		if (node.parent.type === 'array') {
			const prefix = node.parent.children.indexOf(node).toString();
			if (node.type === 'object') {
				s = prefix + ': { '+ this.getNodeChildrenCount(node) +' }';
			}
			else if (node.type === 'array') {
				s = prefix + ': [ '+ this.getNodeChildrenCount(node) +' ]';
			}
			else {
				s = prefix + ': ' + node.value.toString();
			}
		}
		else {
			const property = node.parent.children[0].value.toString();
			if (node.type === 'array' || node.type === 'object') {
				if (node.type === 'object') {
					s = '{ '+ this.getNodeChildrenCount(node) +' } ' + property;
				}
				else if (node.type === 'array') {
					s = '[ '+ this.getNodeChildrenCount(node) +' ] ' + property;
				}
			}
			else {
				const value = this.editor.document.getText(new vscode.Range(this.editor.document.positionAt(node.offset), this.editor.document.positionAt(node.offset + node.length)));
				s = `${property}: ${value}`;
				if (property === "id" || property === "type") {
					// mandatory
					hl = [[0, property.length]];
				}
			}
		}
		const xlabel : vscode.TreeItemLabel = { label: s, highlights: hl};
		return xlabel;
	}

	private getNodeChildrenCount(node: json.Node): string {
		let count = '';
		if (node && node.children) {
			count = node.children.length + '';
		}
		return count;
	}
}