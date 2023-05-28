# Trace Browser Specification
May 27 2023 by JHR, using ChatGPT & copilot

## Purpose
The Trace Browser is a simple tool designed to help VS Code programmers navigate source code using trace log files. It provides a user interface with two columns: trace entries and source code content. It allows the user to select a trace file and browse through its entries.

## Install
- Install Visual Studio Code.
- Install the Live Server extension.
- Copy the trace-browser folder to the root directory of the project.
- Open the trace-browser folder in Visual Studio Code.
- Open the index.html file in the editor.
- Right-click on the index.html file and select "Open with Live Server".
- The Trace Browser should open in a new browser tab.

## User Interface
The Trace Browser has a two-column layout. The left column displays the trace entries, and the right column displays the file content at the position specified by the selected trace entry. The user can click on a trace entry to view the corresponding file content. The user may then use the up and down arrow keys to navigate through the trace entries.

## Trace Entry Format
The trace entries in the trace file follow the format: `<file>:<line>:<column>`.
- `<file>`: The name of the file that the trace is about.
- `<line>`: The line number.
- `<column>`: The column number.

Example:
index.js:1:1
index.js:2:1
index.js:3:1
index.html:1:1
index.html:1:2

## File Selection
The user can select a trace log file by clicking on a "Select File" button at the top of the user interface.
Clicking the "Select File" button should open a file selection dialog that allows the user to choose a trace log file. The selected file should be loaded into the Trace Browser and its log entries should be displayed in the left column with the first entry pre selectionned.

## Displaying Log Entries
The Trace Browser displays the log entries from the selected file in the left column. Each log entry is shown as a clickable item.

## Keyboard Navigation
The user can navigate through the log entries using the up and down arrow keys.
Pressing the up arrow key should select the previous log entry.
Pressing the down arrow key should select the next log entry.
When a log entry is selected using the keyboard, the corresponding file content should be displayed in the right column.

## Viewing File Content
When a log entry is clicked or selected using the keyboard, the Trace Browser retrieves the corresponding file content from the local file system. The file content is displayed in the right column. The displayed content includes multiple lines, including the selected line and some lines around it to provide context, enough to fill all the vertical space. The traced line in the file content is highlighted. Inside it, the traced column is also highlighted. Use a font that is appropriate for the file type, typically monospace.

## Implementation Constraints
- There must be files index.html, styles.css & index.js in the root directory of the project.
- These files will be served by the Live Server extension of Visual Studio Code.
- Do not use node.js or any other server side technology.
- Puppeteer will find the page at http://localhost:5500/trace-browser/index.html.
- The code must be written in JavaScript only, not TypeScript.
- When browsing the content of an HTML file, the content must be escaped.
- Use local trace files, read them using a FileReader.
- The default extension for trace files is ".trace".
- Display 12 lines of content before and after the selected line.
- Use the Flexbox layout model to create a two-column layout.
- Leave nothing TODO.

## Checklist
- Clicking the "Select File" button opens a file selection dialog.
- The Trace Browser then has a two-column layout.
- The left column displays the trace entries.
- The right column displays the file content.
- The user can click on a trace entry to view the corresponding file content.
- The user can use the up and down arrow keys to navigate through the trace entries.
- The user can select a trace log file by clicking on a "Select File" button.
- The selected file is loaded into the Trace Browser.
- The log entries from the selected file are displayed in the left column.
- Each log entry is shown as a clickable item.
- The user can navigate through the log entries using the up and down arrow keys.
- Pressing the up arrow key selects the previous log entry.
- Pressing the down arrow key selects the next log entry.
- When a log entry is selected using the keyboard, the corresponding file content is displayed in the right column.
- When a log entry is clicked or selected using the keyboard, the Trace Browser retrieves the corresponding file content from the local file system.
- The file content is displayed in the right column.
- The displayed content includes multiple lines, including the selected line and some lines around it to provide context.
- The traced line in the file content is highlighted.
- Inside it, the traced column is also highlighted.
- There are files index.html, styles.css & index.js in the root directory of the project.
- These files are served by the Live Server extension of Visual Studio Code.
- Do not use node.js or any other server side technology.
- The code is written in JavaScript only, not TypeScript.
- When browsing the content of an HTML file, the content is escaped.
- Use local trace files, read them using a FileReader.
- The default extension for trace files is ".trace".
- Use the Flexbox layout model to create a two-column layout.


## Testing
Tests are done using jest and puppeteer. To run the tests, run the following command in the terminal:
```
npm test
```
The tests are in the tests folder. The "integration.js" file contains the integration tests. The "unit.js" file contains the unit tests.


---

By following this simplified specification, you, a X10 programmer, should implement the Trace Browser tool that allows users to navigate trace log files, select log entries, and view the corresponding file content. The specification provides the basic functionality and user interface requirements to guide the development process.

Please generate the required files, retry until all the constraints are verified, until the check list passes, omit all comments.
