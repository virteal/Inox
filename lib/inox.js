/* inox.js
 *   Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
 * minimalist concatenative safe dynamic programming language.
 *
 * june 3 2021 by jhr
 * june 7 2021 by jhr, move from .js to .ts, ie Typescript
 */ //
// Inox targets the webassembly virtual machine but runs on other architectures
// too. It is a multi dialect language because it values diversity.
//
// Main entities:
// Cells - that's what memory is made of.
// Acts  - aka activation records or closures.
// Tasks - they run code in a cooperative manner.
//
// Type of values:
// Symbol        - #such_names are efficient, both speed and memory usage
//  Void         - void is void is void, singleton
//  Undefined    - pretty much like javascript's undefined, singleton
//  Free         - unbound, see prolog
//  Nil,         - empty list, (), singleton, see lisp
// Boolean       - true or false, dualton
//  Fail         - like in Icon; ToDo: with out without a cause?
// Magnitude     - More or less, see smalltalk
//  Number       - how much?
//   Complex     - I know, sorry about thatou may skip it
//    Real       - whatever that means
//     Rational  - Not so much
//      Integer  - a kind of Number I guess, native size, minus decoration
//      Unsigned - unsigned integers, eqv webassembly's usize
//      i8, u8, i6, u16, i32, u32, i64, u64 - webassembly
// Float         - another kind of numbers, huge
//  f32, f64     - webassembly
// Any           - webassembly's anyref
// Cell          - a pointer to a memory cell, each type/name/value
// Address       - address of a byte in memory
// Object        - they have an id and their name is the name of their class
//   Box         - a proxy to a value typically, adds an indirection level
// Lists         - with an head and the rest, enumerable
//  Array        - indexed, 0 based
//   v128        - webassembly, a vector, possibly 16 bytes
//  String       - like in javascript, not 0 terminated like in C
//  Maps         - between symbols and arbitrary values, or betweed ids & values
//  Set          - with members
//  Reactive     - ToDo: reactive sets,
//                 see https://github.com/ReactiveSets/toubkal
//
// Values versus objects: values of types List, Array, Map, Object, Cell,
// Act and Task are actualy references to same mutable underlying value. The
// values with other types are immutable. There should be some immutable
// version of List, Array and Map to improve safety and favor functional
// programming style, maybe using some freezing mechanism.
//
// This is the reference implementation. It defines the syntax and semantic
// of the language. Production quality version of the virtual machine would
// have to be hard coded in some machine code to be efficient.
//## dialect-typescript;
// This compilation directive tells the Inox compiler to switch to javascript
// ToDo: implement that dialect and make sure this current file complies to it.
// The first characters of a file define the syntax for comments.
// Anything before a whitespace is a "start of comment", if it is longer than
// one character then it its the start of of a "multi line comment" with the
// the end of comment being the same characters except for the first one that
// becomes the ending characters. That works for /* and */ and other syntaxes.
// Characters after the first multi line comment define the one line comment.
// my de&&bug darling
function bug(msg) {
    console.log(msg);
}
var de = true;
de && bug("Inox starting...");
// Some constants about memory layout
var MEM_SIZE = 1024 * 16; // 16kb
function inox(state, event, source) {
    // Starts running an Inox machine, returns a Promise of some future result,
    // The state and event parameters are decoded json structures.
    // The source parameter is a string, maybe the content of an .ino text file.
    var _ = 0; // undefined;
    var sizeof_Address = 4;
    var sizeof_Type = 1;
    var sizeof_Name = 4;
    var sizeof_Value = 4;
    var sizeof_Cell = 8; // 64 bits
    // A memory cell has an address, a type, a value and a name maybe.
    // When the type is "list", the name is address of the rest of the list.
    // The encoding stores all of that in a 64 bits word.
    // this.type  = type;  // a ref to a Symbol type of cell
    // this.name  = name;  // a ref to a Symbol type of cell xor next in list.
    // this.value = value; // depends on type, often a pointer
    // Other possible layouts :
    //  32 bits values, 8 bits types, 24 bits addresses, 4 bytes per cell
    //  40 bits values, 8 bits types, 16 bits addresses, 5 bytes per cell
    //  48 bits values, 5 bits types, 11 bits addresses, 6 bytes per cell
    //  16 bits values, 5 bits types, 11 bits addresses, 32 bits cells, 4kb
    // The layout could also vary according to the type.
    // cell number 0 is special, 0/0/0, void/void/void
    var next_cell = 1;
    // ToDo: should be by Process?
    var ram = new Uint32Array(MEM_SIZE / 4);
    function allocate_cell() {
        return next_cell++;
    }
    function allocate_bytes(size) {
        // Align on 64bits
        var aligned_size = (size + 7) >> 3;
        var r = next_cell;
        next_cell += aligned_size;
        return r;
    }
    function store_value(address, value) {
        ram.set([value], address);
    }
    function fetch_value(address) {
        var words = ram.slice(address, 1);
        return words[0];
    }
    function store_address(address, value) {
        ram.set([value], address);
    }
    function fetch_address(address) {
        var words = ram.slice(address, 1);
        return words[0];
    }
    function make_cell(type, name, value) {
        var address = allocate_cell();
        store_cell(address, type, name, value);
        return address;
    }
    function store_cell(address, type, value, name) {
        // Pack type and name together
        var word1 = (type << 24) + name;
        var word2 = value;
        ram.set([word1, word2], address);
    }
    var set_cell = store_cell;
    function fetch_cell(address) {
        var words = ram.slice(address, 2);
        var word1 = words[0];
        var word2 = words[1];
        // Unpack type and name
        var type = word1 >> 24;
        var name = word1 & 0xfffff;
        var value = word2;
        return { type: type, name: name, value: value };
    }
    var get_cell = fetch_cell;
    function get_cell_type(cell) {
        // Returns the type of a cell, as a Symbol cell
        return cell.type;
    }
    function get_cell_name(cell) {
        // Returns the name of a cell, as a Symbol cell
        return cell.name;
    }
    function get_next_cell(cell) {
        // Assuming cell is a list member, return next cell in list
        var name = cell.name;
        var address = name << 3;
        return address;
    }
    function set_next_cell(cell, address) {
        // Assuming cell is a list member, set the next cell in list
        cell.name = address >> 3;
    }
    function get_cell_value(cell) {
        // Returns the opaque value of a cell, native word length
        return cell.value;
    }
    function get_cell_value64(cell) {
        // Returns the opaque value of a cell, double word
        return cell.value;
    }
    function set_cell_content(cell, source) {
        // Change the content of a cell
        cell.type = source.type;
        cell.value = source.value;
        cell.name = source.name;
    }
    function set_cell_value(cell, source) {
        // Change the content of a cell but keep the previous name
        cell.type = source.type;
        cell.value = source.value;
    }
    function set_cell_name(cell, name) {
        // Change the content of a cell but keep the previous name
        cell.name = name;
    }
    // This is initialy the sentinel tail of reallocatable cells
    var free_cells = allocate_cell();
    function fast_allocate_cell(type, value, name) {
        // Allocate a new cell or reuse an free one
        var address = free_cells;
        var cell = fetch_cell(get_next_cell(fetch_cell(free_cells)));
        if (!cell.type)
            return make_cell(type, value, name);
        free_cells = cell.value;
        cell.type = type;
        cell.value = value;
        cell.name = name;
        store_cell(address, type, name, value);
        return cell;
    }
    function free_cell(address) {
        // free a cell, add it to the free cells list
        var cell = fetch_cell(address);
        // ToDo: define a type for free cells, instead of 1
        store_cell(address, 1, free_cells, 0);
        free_cells = address;
    }
    // -----------------------------------------------------------------------
    //  Symbol & Void, type 1 & type 0
    //
    var type_symbol = "Symbol";
    var all_symbols = {};
    function make_symbol(name) {
        var symbol = all_symbols[name];
        if (symbol)
            return symbol;
        symbol = make_cell(1, name, name);
        all_symbols[name] = symbol;
        return symbol;
    }
    var type_void = "Void";
    var symbol_void = make_symbol(type_void);
    var void_value = make_cell(0, _, _);
    var symbol_symbol = make_symbol(type_symbol);
    // -----------------------------------------------------------------------
    //  String, type 3
    //
    var type_string = "String";
    var symbol_string = make_symbol(type_string);
    var small_strings = {};
    function make_string(value) {
        var string = small_strings[value];
        if (string)
            return string;
        string = make_cell(2, symbol_string, value);
        if (value.length() <= 1) {
            small_strings[value] = string;
        }
        return string;
    }
    // -----------------------------------------------------------------------
    //  Integer, type 4
    //
    var type_integer = "Integer";
    var symbol_integer = make_symbol(type_integer);
    function make_integer(value) {
        var integer = make_cell(4, symbol_integer, value);
    }
    // -----------------------------------------------------------------------
    //  Float, type 5
    //
    var type_float = "Float";
    var symbol_float = make_symbol(type_float);
    function make_float(value) {
        return make_cell(5, value, symbol_float);
    }
    // -----------------------------------------------------------------------
    //  List, type 6
    //
    var type_list = "List";
    var symbol_list = make_symbol(type_list);
    function make_list() {
        // ToDo: value should a linked list of cells
        return make_cell(6, 0, symbol_list);
    }
    // -----------------------------------------------------------------------
    //  Array, type 7
    //
    var type_array = "Array";
    var symbol_array = make_symbol(type_array);
    function make_array() {
        // ToDo: value should be a slice inside the task's memory
        return make_cell(7, 0, symbol_array);
    }
    // -----------------------------------------------------------------------
    //  Map, type 8
    //
    var type_map = "Map";
    var symbol_map = make_symbol(type_map);
    function make_map() {
        return make_cell(8, 0, symbol_map);
    }
    // -----------------------------------------------------------------------
    //  Object, type 8
    //
    var type_object = "Object";
    var symbol_object = make_symbol(type_object);
    function make_object() {
        return make_cell(8, 0, symbol_object);
    }
    // -----------------------------------------------------------------------
    //  Function, type 9
    //
    var type_function = "Function";
    var symbol_function = make_symbol(type_function);
    function make_function() {
        return make_cell(9, 0, symbol_function);
    }
    // -----------------------------------------------------------------------
    //  Act
    //
    var type_act = "Act";
    var symbol_Act = make_symbol(type_act);
    var sizeof_RefCount = 4;
    var sizeof_Act = sizeof_Address + 4 + sizeof_Address;
    function make_act(parent) {
        var address = allocate_bytes(sizeof_Act);
        store_value(address, 1);
        store_address(address + sizeof_RefCount, parent);
        return address;
    }
    function get_act_refcount(address) {
        return fetch_value(address);
    }
    function get_act_parent(address) {
        return fetch_address(address + sizeof_RefCount);
    }
    function set_act_refcount(address, count) {
        store_value(address, count);
    }
    function set_act_parent(address, parent) {
        store_address(address + sizeof_RefCount, parent);
    }
    var free_acts = make_act(0);
    var root_act = free_acts;
    function allocate_act(parent) {
        var act = free_acts;
        var count = get_act_refcount(act);
        if (count)
            return make_act(parent);
        set_act_refcount(act, 1);
        free_acts = get_act_parent(act);
        set_act_parent(act, parent);
        return act;
    }
    function free_act(act) {
        set_act_parent(act, free_acts);
        free_acts = act;
    }
    function ref_act(act) {
        set_act_refcount(act, get_act_refcount(act) + 1);
    }
    function deref_act(act) {
        var count = get_act_refcount(act);
        count--;
        if (count == 0) {
            free_act(act);
        }
    }
    // -----------------------------------------------------------------------------
    //  Task
    //
    var type_Task = "Task";
    var symbol_Task = make_symbol(type_Task);
    var Task = /** @class */ (function () {
        function Task(parent, act, ram_size) {
            // Inox machines run cooperative tasks, actors typically,
            this.parent = parent;
            this.act = act;
            this.mp = 0;
            this.pp = ram_size;
            this.ip = 0;
            this.stack = new Uint32Array(32);
            this.sp = 0;
            this.builtins = new Map();
            this.words = new Map();
            this.compile_builtins = new Map();
            this.compile_words = new Map();
        }
        return Task;
    }());
    var make_task = function (parent, act) {
        var size = 1024 * 32; // 32 kb
        if (parent) {
            size = parent.size;
        }
        var new_task = new Task(parent, act, size);
        // If parent task then copy memory from it
        if (parent) {
            // ToDo
        }
        // Fill parameter stack with act's parameters
        // ToDo [ act.locals ];
        return new_task;
    };
    var task = make_task(undefined, root_act);
    var root_task = task;
    var free_tasks = task;
    var all_tasks = {};
    function allocate_task(parent, act) {
        var task = free_tasks;
        if (!task.ip)
            return make_task(parent, act);
        task.ip = 1;
        task.parent = parent;
        task.act = act;
        return task;
    }
    function free_task(task) {
        task.parent = free_tasks;
        free_tasks = task;
    }
    function push(task, cell) {
        // Push data on parameter stack
        set_cell(task.pp--, cell.type, cell.name, cell.value);
    }
    function pop(task) {
        // Consume top of parameter stack
        return get_cell(task.pp++);
    }
    // builtin to switch to another task
    function task_switch(task) {
        var new_task = pop(task).value;
        task = new_task;
    }
    function builtin_make_task(task, ip) {
        var parameters = pop(task);
        var act = allocate_act(parent);
        var new_task = allocate_task(task, act);
        push(new_task, parameters);
        new_task.ip = ip;
        new_task.builtins = task.builtins;
        new_task.words = task.words;
        new_task.compile_builtins = task.compile_builtins;
        new_task.compile_words = task.compile_words;
        push(task, get_cell(make_cell(symbol_Task, symbol_Task, new_task)));
    }
    ;
    // -----------------------------------------------------------------------
    //  Builtins
    //
    // Helper to define a builtin
    function builtin(name, fn) {
        task.builtins[name] = fn;
    }
    // ToDo: core dictionary
    // Parameters stack manipulations
    builtin("push", push); // ToDo: fix, should be like dup
    builtin("pop", pop);
    builtin("dup", function (task) {
        // ToDo: optimize this
        var top = pop(task);
        push(task, top);
        push(task, top);
    });
    builtin("drop", pop);
    builtin("log", function (task) {
        console.log(pop(task));
    });
    var symbol_method_missing = make_symbol("method_missing");
    var symbol_compile_method_missing = make_symbol("compile_method_missing");
    var void_token = {
        type: "",
        value: "",
        index: 0
    };
    var text = source;
    var text_length = text.length;
    var back_token = void_token;
    var token_state = "comment";
    var text_cursor = 0;
    // Smart detection of comments syntax, somehow
    var is_c_style = false;
    var is_forth_style = false;
    var is_lisp_style = false;
    var comment_multiline_begin = "";
    var comment_multiline_begin_begin = "";
    var comment_multiline_end = "";
    var comment_multiline_end_end = "";
    var comment_monoline_begin = "";
    var comment_monoline_begin_begin = "";
    var first_comment = true;
    function make_token(type, value, ii) {
        return {
            type: type,
            value: value,
            index: ii - 1 // ii is always one character ahead
        };
    }
    function unget_token(token) {
        back_token = token;
    }
    function get_next_token() {
        // If there is some token already, deliver it
        var token = back_token;
        if (token !== void_token) {
            back_token = void_token;
            return token;
        }
        // Collect token text
        var buf = "";
        var sep = "";
        var ii = text_cursor;
        var state = token_state;
        var ch = "";
        var is_space = false;
        var is_eol = false; // End Of Line
        var next_ch = "";
        function ch_is_space(ch) {
            // ToDo: avoid regexp
            return /\s/.test(ch.charAt(0));
        }
        function ch_is_eol(ch) {
            // ToDo: handle crlf better
            if (ch == "\n")
                return true;
            if (ch == "\n")
                return true;
            return false;
        }
        eat: while (true) {
            // EOF
            if (ii === text_length) {
                if (state == "base") {
                    token = { type: "eof", value: "", index: ii };
                    break eat;
                }
                // Premature, something else was expected
                token = {
                    type: "error",
                    value: "eof in token " + state,
                    index: ii
                };
                break eat;
            }
            // Get next character, check if it is a space or end of line
            ch = text[ii];
            ii++;
            is_space = ch_is_space(ch);
            is_eol = ch_is_eol(ch);
            // Also get next next char, some lookahead helps sometimes
            if (ii == text_length) {
                next_ch = "";
            }
            else {
                next_ch = text[ii];
            }
            // Collect comment
            if (state == "comment") {
                // When inside the first comment at the very beginning of the file
                if (first_comment && is_space) {
                    // C style of comment, either // or /* xxx */
                    if (buf == "/*" || buf == "//") {
                        is_c_style = true;
                        comment_multiline_begin = "/*";
                        comment_multiline_begin_begin = "/";
                        comment_multiline_end = "*/";
                        comment_multiline_end_end = "/";
                        comment_monoline_begin = "//";
                        comment_monoline_begin_begin = "/";
                        // Forth style, ( xxx )
                    }
                    else if (buf == "(") {
                        is_forth_style = true;
                        comment_multiline_begin = "(";
                        comment_multiline_begin_begin = "(";
                        comment_multiline_end = ")";
                        comment_multiline_end_end = ")";
                        // Lisp style, ;
                    }
                    else if (buf == ";") {
                        is_lisp_style = true;
                        comment_monoline_begin = ";";
                        comment_monoline_begin_begin = ";";
                        // Prolog style, %
                    }
                    else if (buf == "%") {
                        is_lisp_style = true;
                        comment_monoline_begin = "%";
                        comment_monoline_begin_begin = "%";
                    }
                }
                // If this is a monoline comment ending, emit it
                if (is_eol
                    && comment_monoline_begin
                    && (buf.slice(0, comment_monoline_begin.length)
                        == comment_monoline_begin)) {
                    // Emit token, without start of comment sequence
                    token = {
                        type: "comment",
                        value: buf.slice(comment_monoline_begin.length - 1),
                        index: ii
                    };
                    break eat;
                }
                // If this terminates the comment, emit the comment
                if (ch == comment_multiline_end_end
                    && (buf.slice(buf.length - comment_multiline_end.length - 1)
                        == comment_multiline_end.slice(0, comment_multiline_end.length - 1))) {
                    // Emit token, without start & end of comment sequence
                    token = {
                        type: "comment_multiline",
                        value: buf.slice(comment_monoline_begin.length - 1),
                        index: ii
                    };
                    break eat;
                }
                // Keep Collecting characters
                buf += ch;
                continue eat;
            }
            // Skip whitespaces
            if (state == "base") {
                // skip whitespaces
                if (is_space) {
                    continue eat;
                }
                // Strings starts with "
                if (ch == "\"") {
                    state = "string";
                    continue eat;
                }
                buf = ch;
                // Comments start differently depending on style
                if (ch == comment_monoline_begin_begin
                    || ch == comment_multiline_begin_begin) {
                    state = "comment";
                    continue eat;
                }
                // Else, it is a "word", including "separators" sometimes
                state = "word";
                continue eat;
            } // base state
            // Collect string until final "
            if (state === "string") {
                // End of string
                if (ch == "\"") {
                    token = { type: "string", value: buf, index: ii };
                    state = "base";
                    break eat;
                }
                // ToDo: handle escape sequences
                buf += ch;
                continue eat;
            } // string state
            // Collect word until separator
            if (state === "word") {
                // Normalize all whitespaces into a simple space character
                if (is_space) {
                    ch = " ";
                }
                // Treat xxx( as if it were ( xxx. Hence ( fn 3 2 ) eqv fn( 3 2 )
                if (ch == "(" && buf.length > 0) {
                    unget_token({ type: ch, value: ch, index: ii });
                    token = { type: "word", value: buf, index: ii - 1 };
                    state = "base";
                    continue eat;
                }
                // Some characters cannot be inside a word
                if (ch == " "
                    || ch == "~"
                    || ch == "^"
                    || ch == "."
                    || ch == "\\"
                    || ch == ":"
                    || ch == "."
                    || ch == ","
                    || ch == "'"
                    || ch == "`"
                    || ch == '"'
                    || ch == '('
                    || ch == ')'
                    || ch == '['
                    || ch == ']'
                    || ch == '{'
                    || ch == '}') {
                    // Handle line continuation when \ is last character on line
                    if (ch == "\\"
                        && ch_is_eol(next_ch)) {
                        // Handle crlf
                        if (next_ch == "\r") {
                            ii++;
                        }
                        // Skip lf
                        ii++;
                        continue eat;
                    }
                    // Either a word followed by some separator
                    if (buf.length) {
                        token = { type: "word", value: buf, index: ii - 1 };
                        // Also push back a separator token unless it is just a space
                        if (ch != " ") {
                            unget_token({ type: ch, value: ch, index: ii });
                        }
                        // Or just the separator itself, with nothing before it
                    }
                    else {
                        token = { type: ch, value: ch, index: ii };
                    }
                    // In both case, emit a token and get back to normal
                    state = "base";
                    break eat;
                }
                buf += ch;
                continue eat;
            } // word state
            // ???
            token = {
                type: "error",
                value: "bad state in get_next_token()",
                index: ii
            };
            break eat;
        } // eat loop
        text_cursor = ii;
        token_state = state;
        return token;
    } // get_next_token()
    // -----------------------------------------------------------------------
    //  Compiler
    //
    // -----------------------------------------------------------------------
    //  run()
    //
    function run(task) {
        // See https://muforth.nimblemachines.com/threaded-code/
        var cell;
        var op_type;
        var builtin_name;
        while (true) {
            // Get cell to execute and move forward
            cell = task.mem[task.ip++];
            // Depending on cell's type
            op_type = cell.type;
            // If this is a builtin, execute it
            if (op_type == "builtin") {
                builtin_name = cell.name;
                if (builtin_name == "next") {
                    // Jump to address on top of stack, lowering it
                    task.ip = task.call_stack[task.rp--];
                    continue;
                }
                // ToDo: when compiling, lookup in q distinct dictionary
                task = task.builtins[builtin_name].apply(task, cell.value);
                if (!task)
                    break;
                continue;
            }
            // If this is jump, do it
            if (op_type == "code") {
                // Push return address
                task.call_stack[task.rp++];
                // Jump to designated address
                task.ip = context.value;
                continue;
            }
            // Else it's data to push on the parameter stack, ie litterals
            task.mem[task.pp--] = cell.value;
        }
    } // run()
    // If source code was provided, compile it first
    // See http://c2.com/cybords/pp4.cgi?muforth/README
    if (source) {
        // Switch to compile time dictionary
        var builtins = task.builtins;
        var words = task.words;
        task.builtins = task.compile_builtins;
        task.words = task.compile_words;
        // ToDo: tokenizer
        run(task);
        task.builtins = builtins;
        task.words = words;
    }
    run(task);
    // ToDo: return diff to apply instead of new state
    return new_state;
}
// -----------------------------------------------------------------------------
// Smoke test
//
inox(undefined, undefined, [
    "( forth )",
    "forth-dialect ;",
    ": hello log ;",
    '"world" hello ;'
].join("n"));
exports.inox = inox;
