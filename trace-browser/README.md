# Trace Browser Specification
May 25 2023 by JHR, using ChatGPT & copilot

## Purpose
The Trace Browser is a simple tool designed to help programmers navigate source code using trace log files. It provides a user interface with two columns: log entries and source code content. It allows the user to select a trace log file and browse through its entries.

## User Interface
The Trace Browser has a two-column layout. The left column displays the log entries, and the right column displays the file content at the position specified by the selected log entry. The user can click on a log entry to view the corresponding file content. The user may then use the up and down arrow keys to navigate through the log entries.

## Log Entry Format
The log entries in the trace log file follow the format: `<file>:<line>:<column>`.
- `<file>`: The name of the file where the log entry is located.
- `<line>`: The line number in the file where the log entry is located.
- `<column>`: The column number in the file where the log entry is located.

Example:
index.js:1:1
index.js:2:1
index.js:3:1
index.html:1:1
index.html:1:2

## File Selection
The user can provide a trace log file to the Trace Browser. The file can be selected through a file selection mechanism in the user interface.

## Displaying Log Entries
The Trace Browser displays the log entries from the selected file in the left column. Each log entry is shown as a clickable item.

## Viewing File Content
When a log entry is clicked, the Trace Browser retrieves the corresponding file content. The file content is displayed in the right column. The displayed content includes multiple lines, including the selected line and some lines around it to provide context. The selected log entriy and the selected source code line are highlighted to distinguish it from other lines.

## Constraints
- There must be files index.html, styles.css & index.js in the root directory of the project.
- It is a client side only application.
- The code must be written in JavaScript.
- When browsing the content of an HTML file, the content must be escaped.
- Use local files only, do not use a server, ask for permission to access the local file system.
- The default extension for trace files is ".trace".
- Display 12 lines of content before and after the selected line, highlight the selected line and mark the column somehow.

---

By following this simplified specification, a programmer can implement the Trace Browser tool that allows users to navigate trace log files, select log entries, and view the corresponding file content. The specification provides the basic functionality and user interface requirements to guide the development process.

Please generate the required files, respecting all the constraints.
