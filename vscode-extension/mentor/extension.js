const vscode = require("vscode");
const { exec } = require("child_process");

let mentorEnabled = false;
let statusBarItem;

function activate(context) {
  console.log("MENTOR extension is now active!");

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = "mentor.toggle";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const toggleCommand = vscode.commands.registerCommand(
    "mentor.toggle",
    async function () {
      mentorEnabled = !mentorEnabled;
      updateStatusBar();

      if (mentorEnabled) {
        try {
          const response = await fetch("http://localhost:3000/ping");
          const data = await response.json();
          vscode.window.showInformationMessage(
            `MENTOR is ON. Core says: ${data.message}`,
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            "MENTOR is ON, but could not reach mentor-core. Is the server running?",
          );
        }
      } else {
        vscode.window.showInformationMessage("MENTOR is now OFF");
      }
    },
  );
  context.subscriptions.push(toggleCommand);

  const runFileCommand = vscode.commands.registerCommand(
    "mentor.runFile",
    async function () {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("No file is open to run.");
        return;
      }

      const filePath = editor.document.fileName;
      vscode.window.showInformationMessage(`MENTOR is running: ${filePath}`);

      exec(`node "${filePath}"`, async (error, stdout, stderr) => {
        const hasError = !!error;
        const output = hasError ? stderr : stdout;

        try {
          const response = await fetch("http://localhost:3000/error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filePath: filePath,
              hasError: hasError,
              output: output,
            }),
          });
          const data = await response.json();

          if (hasError) {
            vscode.window.showErrorMessage(
              `MENTOR caught an error! Check output for details.`,
            );
          } else {
            vscode.window.showInformationMessage(
              `Ran successfully. Output: ${output.trim()}`,
            );
          }
        } catch (fetchError) {
          vscode.window.showErrorMessage(
            "Could not reach mentor-core to report this.",
          );
        }
      });
    },
  );
  context.subscriptions.push(runFileCommand);
}

function updateStatusBar() {
  if (mentorEnabled) {
    statusBarItem.text = `$(mortar-board) MENTOR: ON`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(mortar-board) MENTOR: OFF`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
