const vscode = require('vscode');

// This variable remembers whether MENTOR is currently ON or OFF
let mentorEnabled = false;

// This will hold our status bar button so we can update it later
let statusBarItem;

function activate(context) {
	console.log('MENTOR extension is now active!');

	// Create the status bar button, aligned to the left, priority 100
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = 'mentor.toggle'; // clicking it will run this command
	updateStatusBar(); // set its initial text/color
	statusBarItem.show(); // actually make it visible
	context.subscriptions.push(statusBarItem);

	// Register the toggle command
	const toggleCommand = vscode.commands.registerCommand('mentor.toggle', function () {
		mentorEnabled = !mentorEnabled; // flip true to false, or false to true
		updateStatusBar();

		if (mentorEnabled) {
			vscode.window.showInformationMessage('MENTOR is now ON 🧑‍🏫');
		} else {
			vscode.window.showInformationMessage('MENTOR is now OFF');
		}
	});

	context.subscriptions.push(toggleCommand);
}

// Updates what the status bar button looks like, based on current state
function updateStatusBar() {
	if (mentorEnabled) {
		statusBarItem.text = `$(mortar-board) MENTOR: ON`;
		statusBarItem.backgroundColor = undefined;
	} else {
		statusBarItem.text = `$(mortar-board) MENTOR: OFF`;
		statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	}
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}