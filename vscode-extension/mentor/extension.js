const vscode = require("vscode");
const { exec } = require("child_process");
const path = require("path");

let mentorEnabled = false;
let statusBarItem;
let diagnosticCollection;

function activate(context) {
  console.log("MENTOR extension is now active!");

  diagnosticCollection = vscode.languages.createDiagnosticCollection("mentor");
  context.subscriptions.push(diagnosticCollection);

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
      await runAndCheckFile(editor.document);
    },
  );
  context.subscriptions.push(runFileCommand);

  // NEW: automatically clear MENTOR's squigglies the moment you save a fixed file
  const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    diagnosticCollection.delete(document.uri);
  });
  context.subscriptions.push(saveListener);
}

async function runAndCheckFile(document) {
  const filePath = document.fileName;
  const extension = path.extname(filePath); // e.g. ".js" or ".py"

  let runCommand;
  if (extension === ".py") {
    runCommand = `python "${filePath}"`;
  } else {
    runCommand = `node "${filePath}"`;
  }

  vscode.window.showInformationMessage(
    `MENTOR is running: ${path.basename(filePath)}`,
  );
  diagnosticCollection.delete(document.uri);

  exec(runCommand, async (error, stdout, stderr) => {
    const hasError = !!error;
    const output = hasError ? stderr : stdout;

    if (hasError) {
      const diagnostic = buildDiagnostic(stderr, document, extension);
      if (diagnostic) {
        diagnosticCollection.set(document.uri, [diagnostic]);
      }
    }

    try {
      await fetch("http://localhost:3000/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, hasError, output }),
      });

      if (hasError) {
        vscode.window.showErrorMessage(
          "MENTOR caught an error! Look for the red underline.",
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
}

function buildDiagnostic(stderr, document, extension) {
  let lineNumber;

  if (extension === ".py") {
    // Python errors look like: File "broken.py", line 4
    const match = stderr.match(/line (\d+)/);
    if (!match) return null;
    lineNumber = parseInt(match[1], 10) - 1;
  } else {
    // Node errors look like: yourfile.js:4
    const match = stderr.match(/:(\d+)\r?\n/);
    if (!match) return null;
    lineNumber = parseInt(match[1], 10) - 1;
  }

  if (isNaN(lineNumber) || lineNumber < 0) return null;
  if (lineNumber >= document.lineCount) lineNumber = document.lineCount - 1;

  const line = document.lineAt(lineNumber);
  const range = new vscode.Range(line.range.start, line.range.end);

  const diagnostic = new vscode.Diagnostic(
    range,
    "MENTOR detected an error on this line.",
    vscode.DiagnosticSeverity.Error,
  );
  diagnostic.source = "MENTOR";
  return diagnostic;
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
