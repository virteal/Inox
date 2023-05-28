document.addEventListener("DOMContentLoaded", () => {
  const selectFileButton = document.getElementById("selectFileButton");
  const logEntriesWindow = document.getElementById("logEntriesWindow");
  const fileContentWindow = document.getElementById("fileContentWindow");

  let selectedFile = null;
  let logEntries = [];

  selectFileButton.addEventListener("click", () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".trace";

    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        selectedFile = file;
        loadLogEntries(file);
      }
    });

    fileInput.click();
  });

  logEntriesWindow.addEventListener("click", (event) => {
    const target = event.target;
    if (target.classList.contains("logEntry")) {
      const index = parseInt(target.dataset.index);
      const logEntry = logEntries[index];
      const fileName = logEntry.file;
      const lineNumber = logEntry.line;

      retrieveFileContent(fileName, lineNumber)
        .then((fileContent) => {
          displayFileContent(fileContent, lineNumber);
        })
        .catch((error) => {
          console.error("Error retrieving file content:", error);
        });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectPreviousLogEntry();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      selectNextLogEntry();
    }
  });

  function loadLogEntries(file) {
    const reader = new FileReader();

    reader.onload = (event) => {
      const contents = event.target.result;
      const entries = contents.split("\n");
      logEntries = parseLogEntries(entries);
      displayLogEntries(logEntries);
    };

    reader.onerror = (event) => {
      console.error("Error reading file:", event.target.error);
    };

    reader.readAsText(file);
  }

  function parseLogEntries(entries) {
    return entries.map((entry) => {
      const [file, line, column] = entry.trim().split(":");
      return {
        file,
        line: parseInt(line),
        column: parseInt(column),
      };
    });
  }

  function displayLogEntries(logEntries) {
    logEntriesWindow.innerHTML = "";

    for (let i = 0; i < logEntries.length; i++) {
      const entry = logEntries[i];
      const logEntryElement = document.createElement("div");
      logEntryElement.classList.add("logEntry");
      logEntryElement.dataset.index = i;
      logEntryElement.innerText = entry.file + ":" + entry.line + ":" + entry.column;
      logEntriesWindow.appendChild(logEntryElement);
    }

    const firstEntry = logEntriesWindow.querySelector(".logEntry");
    if (firstEntry) {
      firstEntry.classList.add("selected");
      const fileName = logEntries[0].file;
      const lineNumber = logEntries[0].line;
      retrieveFileContent(fileName, lineNumber)
        .then((fileContent) => {
          displayFileContent(fileContent, lineNumber);
        })
        .catch((error) => {
          console.error("Error retrieving file content:", error);
        });
    }
  }

  function retrieveFileContent(fileName, lineNumber) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", fileName, true);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            resolve(xhr.responseText);
          } else {
            reject(new Error(`Failed to retrieve file content: ${xhr.status} ${xhr.statusText}`));
          }
        }
      };
      xhr.send();
    });
  }

  function displayFileContent(fileContent, lineNumber) {
    const lines = fileContent.split("\n");
    const startLine = Math.max(0, lineNumber - 12);
    const endLine = Math.min(lines.length - 1, lineNumber + 12);

    fileContentWindow.innerHTML = "";

    for (let i = startLine; i <= endLine; i++) {
      const lineElement = document.createElement("div");
      lineElement.classList.add("line");
      lineElement.dataset.lineNumber = i + 1;
      lineElement.innerText = escapeHtml(lines[i]);

      if (i === lineNumber - 1) {
        lineElement.classList.add("highlightedLine");
        lineElement.innerHTML = highlightColumn(lineElement.innerHTML, logEntries.find((entry) => entry.line === lineNumber)?.column);
      }

      fileContentWindow.appendChild(lineElement);
    }
  }

  function selectPreviousLogEntry() {
    const currentEntry = logEntriesWindow.querySelector(".logEntry.selected");
    if (currentEntry) {
      currentEntry.classList.remove("selected");
      const prevEntry = currentEntry.previousElementSibling;
      if (prevEntry) {
        prevEntry.classList.add("selected");
        prevEntry.scrollIntoView({
          block: "nearest",
        });
        const index = parseInt(prevEntry.dataset.index);
        const logEntry = logEntries[index];
        const fileName = logEntry.file;
        const lineNumber = logEntry.line;
        retrieveFileContent(fileName, lineNumber)
          .then((fileContent) => {
            displayFileContent(fileContent, lineNumber);
          })
          .catch((error) => {
            console.error("Error retrieving file content:", error);
          });
      }
    }
  }

  function selectNextLogEntry() {
    const currentEntry = logEntriesWindow.querySelector(".logEntry.selected");
    if (currentEntry) {
      currentEntry.classList.remove("selected");
      const nextEntry = currentEntry.nextElementSibling;
      if (nextEntry) {
        nextEntry.classList.add("selected");
        nextEntry.scrollIntoView({
          block: "nearest",
        });
        const index = parseInt(nextEntry.dataset.index);
        const logEntry = logEntries[index];
        const fileName = logEntry.file;
        const lineNumber = logEntry.line;
        retrieveFileContent(fileName, lineNumber)
          .then((fileContent) => {
            displayFileContent(fileContent, lineNumber);
          })
          .catch((error) => {
            console.error("Error retrieving file content:", error);
          });
      }
    }
  }

  function highlightColumn(lineContent, column) {
    if (column) {
      const highlightedColumnContent = lineContent.substring(0, column - 1) + '<span class="highlightedColumn">' + lineContent[column - 1] + "</span>" + lineContent.substring(column);
      return highlightedColumnContent;
    }
    return lineContent;
  }

  function escapeHtml(html) {
    const element = document.createElement("div");
    element.innerText = html;
    return element.innerHTML;
  }
});
