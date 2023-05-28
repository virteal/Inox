const logEntries = document.getElementById('log-entries');
const fileContent = document.getElementById('file-content');

const defaultExtension = '.trace';

let selectedEntryIndex = -1;

function displayLogEntries(entries) {
  logEntries.innerHTML = '';
  entries.forEach(entry => {
    const item = document.createElement('li');
    item.textContent = entry;
    item.addEventListener('click', () => {
      selectLogEntry(item);
    });
    logEntries.appendChild(item);
  });
}

function displayFileContent(entry) {
  const [file, line, column] = entry.split(':');
  fetch(file)
    .then(response => response.text())
    .then(data => {
      const lines = data.split('\n');
      const start = Math.max(0, Number(line) - 12);
      const end = Math.min(lines.length, Number(line) + 12);
      const content = lines.slice(start, end).map((lineContent, index) => {
        const lineNumber = start + index + 1;
        const highlighted = lineNumber == Number(line) ? 'highlight' : '';
        const lineNumClass = `line-number ${highlighted}`;
        return `<div><span class="${lineNumClass}">${lineNumber}</span>${escapeHtml(lineContent)}</div>`;
      }).join('');
      fileContent.innerHTML = content;
    })
    .catch(error => {
      console.error(error);
    });
}

function loadTraceFile(file) {
  const reader = new FileReader();
  reader.onload = event => {
    const entries = event.target.result.split('\n');
    displayLogEntries(entries);
  };
  reader.readAsText(file);
}

function handleFileSelection(event) {
  const file = event.target.files[0];
  if (file.name.split('.').pop() !== defaultExtension.slice(1)) {
    console.error(`Invalid file extension. Expected ${defaultExtension}`);
    return;
  }
  loadTraceFile(file);
}

function selectLogEntry(entry) {
  const index = Array.from(logEntries.children).indexOf(entry);
  selectedEntryIndex = index;
  Array.from(logEntries.children).forEach((child, i) => {
    if (i === index) {
      child.classList.add('selected');
    } else {
      child.classList.remove('selected');
    }
  });
  displayFileContent(entry.textContent);
}

document.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (selectedEntryIndex > 0) {
      selectedEntryIndex--;
      selectLogEntry(logEntries.children[selectedEntryIndex]);
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (selectedEntryIndex < logEntries.children.length - 1) {
      selectedEntryIndex++;
      selectLogEntry(logEntries.children[selectedEntryIndex]);
    }
  }
});

const fileSelector = document.getElementById('file-selector');
fileSelector.addEventListener('change', handleFileSelection);

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, match => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#039;';
    }
  });
}

