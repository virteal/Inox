"use strict";
/*  inox.js
 *  Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
 *  minimalist concatenative functional dynamic programming language.
 *
 *  june 3 2021 by jhr
 *  june 7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 *  june 10 2021 by jhr, .nox file extension
 */
exports.__esModule = true;
var console_1 = require("console");
function inox(json_state, json_event, source) {
    // Starts running an Inox machine, returns a json encoded new state.
    // ToDo: return diff instead of new state
    // The source parameter is a string, maybe the content of a .nox text file.
    // Inox targets the webassembly virtual machine but runs on other
    // architectures too, including micro controllers like the esp32.
    // It is a multi dialect language because it values diversity.
    //
    // Main entities:
    // Cells - that's what memory is made of.
    // Acts  - aka activation records or closures.
    // Tasks - they run code in a cooperative manner.
    //
    // Type of values:
    // Symbol        - #such_names are efficient, both speed and memory usage
    //  void         - void is void is void, singleton. integer 0
    //  undefined    - pretty much like javascript's undefined, singleton
    //  free         - unbound, see prolog
    //  nil          - empty list, (), singleton, see lisp
    //  true         - boolean. integer 1 actualy
    //  false        - boolean. integer 0 actualy
    //  fail         - like in Icon; integer -1. ToDo: without a cause?
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
    //
    // Text          - like strings in javascript, immutable, not like C's 0 ending
    // Any           - webassembly's anyref
    //
    // Address       - address of a byte in memory
    // Cell          - a pointer to a memory cell, each type/name/value
    // Object        - they have an id and their name is the name of their class
    //   Box         - a proxy to a value typically, adds an indirection level
    //   Collection
    //     Lists     - linked, with an head and the rest, enumerable
    //     Array     - indexed, 0 based
    //     v128      - webassembly, a vector, possibly 16 bytes
    //     Maps      - between keys and values
    //     Set       - with members
    //     Reactive  - ToDo: reactive sets,
    //                 see https://github.com/ReactiveSets/toubkal
    //
    // Values versus objects: values of types List, Array, Map, Object, Cell,
    // Act and Task are actualy references to same mutable underlying value. The
    // values with other types are immutable. There should be some immutable
    // version of List, Array and Map to improve safety and favor functional
    // programming style.
    //
    // This is the reference implementation. It defines the syntax and semantic
    // of the language. Production quality version of the virtual machine would
    // have to be hard coded in some machine code to be efficient.
    //
    // To the reader: this source file is meant to be read as an essay about
    // software in the late 1980 / early 2000, a 40 years period of time when
    // everything was so new about software and computers. I figured out that
    // some anecdoctes may interest the historians in some potential future.
    // Dedicated to my children, Lucas and Marie-Louise.
    //## dialect-typescript;
    // This compilation directive tells the Inox compiler to switch to javascript
    // ToDo: implement that dialect and make sure this current file complies to it.
    // The first characters of a file define the syntax for comments.
    // Anything before a whitespace is a "start of comment", if it is longer than
    // one character then it its the start of of a "multi line comment" with the
    // the end of comment being the same characters except for the first one that
    // becomes the ending characters. That works for /* and */ and other syntaxes.
    // Characters after the first multi line comment define the one line comment.
    // Inspiration
    // Forth. When I started programming, on a Commodore VIC20, the standard
    // language was BASIC. Soon a Forth "cartridge" became commercialy available.
    // I ordered it. It took forever to be delivered. When I plugged it I
    // basically got totally lost. Much like when I first saw the 2001 movie
    // by Stanley Kubrick. It took me years to understand. What attracted me
    // initialy was speed and compactness. VIC20 had only 3.5kb of memory and
    // BASIC was slow. 6502 machine code was out of my league at the time, I
    // was 15 and no experience with programming. That was in 1981 I think, 82
    // maybe.
    // See https://en.wikipedia.org/wiki/Commodore_VIC-20
    //
    // BASIC. Program is store in memory in a very compact form using "tokens".
    // REM starts a comment, DIM declares an array, GOSUB <LineNumber>, etc.
    // See https://www.infinite-loop.at/Power20/Documentation/Power20-ReadMe/AA-VIC-20_BASIC.html
    // Inox uses tokens to store code. Each instructions is a 16 bits word.
    // Some instructions are primitives, other are user defined. They are both
    // named "words". Like in Forth a word can execute in interpreted mode
    // or in compile mode. In the later case, during source parsing, the
    // word can prepare stuff to be used when in interpreted mode, compute
    // relative jumps for example.
    //
    // Inox is stack based like Forth and token based like BASIC. Using
    // dialects, it is possible to mix vocabularies from different languages
    // in the same source file. That way, you can leverage your past
    // knowledge and feel at home right away. Almost.
    /* -----------------------------------------------------------------------------
     *  Let's go
     */
    // my de&&bug darling, de flag could be a variable
    var de = true;
    function bug(msg) {
        console.log(msg);
    }
    var mand = function (condition) {
        if (condition)
            return;
        console_1.assert(false);
    };
    console_1.assert(de); // Not ready for production, please wait :)
    de && mand(de); // Like assert but that can be disabled for speed
    de && bug("Inox starting...");
    /* -----------------------------------------------------------------------------
     *  Make it work in the javascript machine, it's the portable scheme.
     *  When compiled using AssemblyScript some changes are required.
     */
    var PORTABLE = true;
    var size_of_word = 2; // 2 bytes, 16 bits
    var size_of_cell = 8; // 8 bytes, 64 bits
    var size_of_value = 4; // 4 bytes, 32 bits
    var words_per_cell = size_of_cell / size_of_word; // 4
    var words_per_value = size_of_value / size_of_word; // 2
    // In memory, the value is stored first, then the type & name info
    var offset_of_cell_info = size_of_value / size_of_word;
    /* ---------------------------------------------------------------------------
     *  Low level memory management.
     *  The Inox virtual machine uses an array of 16 bits words to store both
     *  the content of "cells" (2 words) and arrays of "code tokens" (1 word). A
     *  cell is the basic value manipulated everywhere. A code is a token that
     *  reference either a javascript defined primitive or an Inox defined word.
     *  The notion of user defined "words" comes from the Forth language.
     */
    // -----------------------------------------------------------------------------
    // ToDo: if( PORTABLE ){
    // Portable versions of load() and store()
    // For the webassembly version, see https://wasmbyexample.dev/examples/webassembly-linear-memory/webassembly-linear-memory.assemblyscript.en-us.html
    // This is "the data segment" of the virtual machine.
    // the "void" first cell is allocated at absolute address 0.
    // That array of 32 bits words is indexed using 29 bits addresses
    // with odd addresses to address 16 bits words.
    // 16 bits is the standard size for UTF16 encoded texts.
    // ToDo: study webassembly modules
    // See https://webassembly.github.io/spec/core/syntax/modules.html
    var memory8 = new ArrayBuffer(1024 * 64); // 64 kb
    var memory16 = new Uint16Array(memory8);
    var memory32 = new Uint32Array(memory8);
    function load32(index) {
        // The right shift translates 16 bits aligned addresses into 32 bits ones
        var value = memory32[index >>> 1];
        // de&&bug( "Load 32 @" + index + " " + value );
        return value;
    }
    function store32(index, value) {
        memory32[index >>> 1] = value;
        // de&&bug( "store 32 @ " + index + " " + value );
        de && mand(load32(index) == value);
    }
    function load16(index) {
        var word = memory16[index];
        // de&&bug( "Load 16 @ " + index + " " + word );
        return word;
    }
    function store16(index, word) {
        memory16[index] = word;
        // de&&bug( "store16 @" + index + " " + word );
        de && mand(load16(index) == word);
    }
    // } // PORTABLE
    /* -----------------------------------------------------------------------------
     *  Not portable version is AssemblyScript syntax
     *  ToDo: figure out what @inline means exactly
     *  ToDo: figure out some method to avoid the right shift when
     *  optimizing for speed instead of for memory
     *  The resulting vm would then have access to less cells,
     *  half of them, but faster.
     */
    if (!PORTABLE) { /*
    
    @inline function load32( index : InoxAddress ) : u32 {
      return load< u32 >( index << 1 );
    }
    
    @inline function store32( index : InoxAddress, value : InoxValue ) : void {
      store< InoxValue >( index << 1, value );
    }
    
    @inline function load16( index : InoxAddress ) : u16 {
      return load< u16 >( index << 1 );
    }
    
    @inline function store16( index : InoxAddress, value : u16 ) : void {
      store< u16 >( index << 1, value );
    }
    
    */
    } // ! PORTABLE?
    // 0 means diffent things depending on the context, it is "void",
    // "false", "nop" instruction code, null object, etc.
    var _ = 0; // undefined;
    /* -----------------------------------------------------------------------------
      *  Cell
      *
      *  A memory cell seats at an address and has a type, a value and a name.
      *  When type is "list", the name is the address of the rest of the list.
      *  Else the nqme is a "symbol", a fixed abritrary value. In some languages
      *  like Lisp symbols are called an "atom".
      *
      *  The encoding stores all of that in a 64 bits word.
      *  cell's type is a numeric id, 0..7
      *  cell's name is the address of a Symbol type of cell (xor next in lists).
      *  cell's value depends on type, often a pointer to some object.
      *
      *  eqv C like struct Cell {
      *    value : InoxValue; // 32 bits word
      *    info  : InoxInfo;  // packed type & name
      *  };
      *
      *  This architecture, with named values, is classicaly called a
      *  tagged architecture.
      *  See https://en.wikipedia.org/wiki/Tagged_architecture
      */
    // In this implementation, the name is a 29 bits pointer that points
    // to 16 bits words, this is equivalent to a 30 bits pointer
    // pointing to bytes. That's 1 giga bytes and 256 millions of cells.
    //
    // Possible layouts :
    //  32 bits values, 3 bits types, 29 bits addresses, 4 bytes per cell
    //  40 bits values, 3 bits types, 25 bits addresses, 5 bytes per cell
    //  48 bits values, 3 bits types, 15 bits addresses, 6 bytes per cell
    //  16 bits values, 3 bits types, 13 bits addresses, 128 kb, 8k words
    //  The layout could also vary according to the type.
    //
    // I used these named values 30 years ago, when I designed the
    // object oriented version of a scriting language named Emul. It was
    // used in a single project, a network supervision system named SAGE.
    // SAGE managed X25 devices that could interop with the french public
    // data network named Transpac. The Minitel national program used that
    // network to serve 1200 bauds clients using X25 connected servers.
    // It all exploded when Internet arrived, circa 1995 approximatly.
    // I survived. That makes me a software "veteran" I guesss.
    var CellContent = /** @class */ (function () {
        function CellContent(cell) {
            var info = fetch_info(cell);
            this.type = unpack_type(info);
            this.name = unpack_name(info);
            this.value = fetch_value(cell);
        }
        return CellContent;
    }());
    // cell number 0 is reserved, special, 0/0/0, void/void/void
    var first_cell = 0;
    if (!PORTABLE) { /*
      first_cell = heap.alloc( 1024 ); // Some initial memory, expanded later
    */
    }
    // Some basic memory allocation, purely growing.
    // This is like sbrk() on Unix
    // See https://en.wikipedia.org/wiki/Sbrk
    // There is some reallocation of cells when some of them are
    // freed, see fast_allocate_cell()
    // ToDo: some C style malloc()/free() combo.
    // This would be HERE in Forth
    // See https://forth-standard.org/standard/core/HERE
    var next_cell = first_cell;
    function allocate_cell() {
        var top = next_cell;
        // Each cell is made of 4 16 bits words
        next_cell += words_per_cell;
        return top;
    }
    function allocate_bytes(size) {
        // Align on 64 bits, size of a cell
        var aligned_size = (size + (size_of_cell - 1))
            & (0xffffffff - (size_of_cell - 1));
        // ToDo: malloc() style allocation?
        var top = next_cell;
        // Divide by 2 because memory is 16 bits words, not bytes
        next_cell += (aligned_size / size_of_word);
        de && mand(load32(top) == 0);
        return top;
    }
    function free_bytes(address, size) {
        // ToDo: add to pool for malloc()
        // ToDo: a simple solution is to split the array into cells
        // and call free_cell() for each of them. That's easy.
    }
    // @inline
    function store(address, value) {
        store32(address, value);
        de && mand(fetch(address) == value);
    }
    // @inline
    function fetch(address) {
        return load32(address);
    }
    // @inline
    function store_value(cell, value) {
        store32(cell, value);
        de && mand(fetch_value(cell) == value);
    }
    // @inline
    function fetch_value(cell) {
        return load32(cell);
    }
    var get_cell_value = fetch_value;
    // @inline
    function store_info(cell, info) {
        store32(cell + offset_of_cell_info, info);
        de && mand(fetch_info(cell) == info);
    }
    // @inline
    function fetch_info(cell) {
        return load32(cell + offset_of_cell_info);
    }
    var get_cell_info = fetch_info;
    // @inline
    function pack(type, name) {
        // Pack type and name together.
        // Name is a 64 bits aligned pointer to a symbol type of cell
        var pack = name << 3 | type;
        de && mand(unpack_type(pack) == type);
        de && mand(unpack_name(pack) == name);
        return pack;
    }
    // @inline
    function unpack_type(value) {
        return value & 0x7; // 3 bits
    }
    // @inline
    function unpack_name(value) {
        return value >>> 3;
    }
    function make_cell(type, name, value) {
        var cell = allocate_cell();
        store_cell(cell, type, name, value);
        de && mand(get_cell_type(cell) == type);
        de && mand(get_cell_name(cell) == name);
        de && mand(get_cell_value(cell) == value);
        return cell;
    }
    function store_cell(cell, type, name, value) {
        // Store value first
        store32(cell, value);
        // Pack type and name together
        store32(cell + offset_of_cell_info, pack(type, name));
        de && mand(get_cell_type(cell) == type);
        de && mand(get_cell_name(cell) == name);
        de && mand(get_cell_value(cell) == value);
    }
    function fetch_cell(cell) {
        var info = fetch_info(cell);
        var value = fetch_value(cell);
        // Unpack type and name
        return {
            type: unpack_type(info),
            name: unpack_name(info),
            value: value
        };
    }
    function get_cell_type(cell) {
        // Returns the type of a cell
        return unpack_type(fetch_info(cell));
    }
    var fetch_type = get_cell_type;
    function get_cell_name(cell) {
        // Returns the name of a cell, as a Symbol id
        return unpack_name(fetch_info(cell));
    }
    var fetch_name = get_cell_name;
    // @inline
    function get_next_cell(cell) {
        // Assuming cell is a list member, return next cell in list
        return unpack_name(fetch_info(cell));
    }
    function set_next_cell(cell, next) {
        // Assuming cell is a list member, set the next cell in list
        // ToDo: assume type is 0 maybe?
        var info = fetch_info(cell);
        var type = unpack_type(info);
        store_info(cell, pack(type, next));
        de && mand(get_next_cell(cell) == next);
    }
    function copy_cell(source, destination) {
        // Change the content of a cell
        store_value(destination, fetch_value(source));
        store_info(destination, fetch_info(source));
        de && mand(get_cell_type(destination) == get_cell_type(source));
        de && mand(get_cell_name(destination) == get_cell_name(source));
        de && mand(get_cell_value(destination) == get_cell_value(source));
    }
    function copy_cell_value(source, destination) {
        // Change the content of a cell but keep the previous name
        var destination_name = unpack_name(fetch_info(destination));
        var source_type = unpack_type(fetch_info(source));
        var source_value = fetch_value(source);
        store_info(destination, pack(source_type, destination_name));
        store_value(destination, source_value);
        de && mand(get_cell_value(destination) == get_cell_value(source));
    }
    // This is initialy the sentinel tail of reallocatable cells
    var nil_cell = 0; // it will soon be the void/void/void cell
    // Linked list of free cells
    var free_cells = nil_cell;
    function fast_allocate_cell() {
        // Allocate a new cell or reuse an free one
        if (free_cells == nil_cell)
            return allocate_cell();
        var cell = free_cells;
        var next_cell = get_next_cell(free_cells);
        free_cells = next_cell;
        return cell;
    }
    function free_cell(cell) {
        // free a cell, add it to the free list
        set_next_cell(cell, free_cells);
        free_cells = cell;
    }
    /* -----------------------------------------------------------------------
     *  Symbol & Void, type 1 & type 0
     *
     *  Symbols have an id, it is an integer. Whenever the value of a symbol
     *  is required as a number, that id is used. Whenever it is the text
     *  representation that is required, it's the name of the symbol that
     *  is used.
     *    0 is both void and false
     *    1 is true, it's symbolic!
     */
    var type_symbol = "true";
    // the dictionary of symbols
    var all_symbol_cells_by_name = new Map();
    var all_symbol_cells_by_id = new Array();
    var all_symbol_names_by_id = new Array();
    var next_symbol_id = 0;
    // The first symbol, void, will be id 0
    function make_symbol(name) {
        if (all_symbol_cells_by_name.has(name)) {
            return all_symbol_cells_by_name.get(name);
        }
        var id = next_symbol_id++;
        var cell = make_cell(1, id, id);
        // Update symbol dictionary
        all_symbol_cells_by_name.set(name, cell);
        all_symbol_cells_by_id[id] = cell;
        all_symbol_names_by_id[id] = name;
        de && mand(symbol_id_to_text(id) == name);
        de && mand(get_symbol_by_id(id) == cell);
        de && mand(fetch_value(cell) == id);
        de && mand(fetch_name(cell) == id);
        de && mand(fetch_type(cell) == 1);
        return cell;
    }
    // Symbol with id 0 is void
    var type_void = "void";
    var void_cell = make_cell(0, 0, 0); // First cell ever
    var symbol_void = make_symbol(type_void);
    // Symbol with id 1 is Symbol
    var symbol_symbol = make_symbol(type_symbol);
    var id_symbol = 1;
    function symbol_id_to_text(id) {
        return all_symbol_names_by_id[id];
    }
    function get_symbol_by_id(id) {
        // Return the address of the cell that holds the symbol singleton
        return all_symbol_cells_by_id[id];
    }
    /* -----------------------------------------------------------------------
     *  Integer, type 2, 32 bits
     *  ToDo: u8+ style to deal with less common arrays of bits.
     */
    var type_integer = "Integer";
    var symbol_integer = make_symbol(type_integer);
    function make_integer(value) {
        return make_cell(2, symbol_integer, value);
    }
    var next_object_id = 0;
    var free_objects = 0;
    // Indirection table to get access to an object using it's id
    var all_objects_by_id = new Array();
    function make_opaque_object(object) {
        // ToDo: return object directly, it fits inside a cell's 32 bits value
        var id = free_objects;
        if (free_objects) {
            free_objects = all_objects_by_id[id];
        }
        else {
            id = next_object_id++;
        }
        all_objects_by_id[id] = object;
        return id;
    }
    // Object with id 0 is special void/null inexistant object
    var null_object = make_opaque_object(0);
    function get_opaque_object_by_id(id) {
        return all_objects_by_id[id];
    }
    function get_cell_opaque_object(cell) {
        var oid = fetch_value(cell);
        return get_opaque_object_by_id(oid);
    }
    function object_id_to_text(id) {
        var obj = get_opaque_object_by_id(id);
        return obj.toString();
    }
    function free_object(id) {
        // ToDo: list of free objects to reallocate
        all_objects_by_id[id] = 0;
        free_objects = id;
    }
    // texts are stored in some opaque objet in this implementation
    var type_text = "Text";
    var symbol_text = make_symbol(type_text);
    function make_text(value) {
        var cell = make_cell(3, symbol_text, make_opaque_object(value));
        de && mand(cell_to_text(cell) == value);
        return cell;
    }
    /* -----------------------------------------------------------------------
     *  Object, type 4
     */
    var type_object = "Object";
    var symbol_object = make_symbol(type_object);
    function make_object(object) {
        var symbol = make_symbol(object.constructor.name);
        return make_cell(4, symbol, make_opaque_object(object));
    }
    /* -----------------------------------------------------------------------------
     *  Act, type 5
     *  An Act is created for functions with local variables, aka closures.
     *  In addition to normal cells, there is a reference counter.
     *  The value of the cell is either void or an array of cells, one for
     *  each local variable encapsulated in the closure.
     *
     *  ToDo: implement this.
     *
     *  This is sometimes called "an activation record"
     *
     *  ToDo: unify with Function and Word types, similar to "bound functions"
     *  in javascript.
     *  ToDo: pointer to parent act to ease debugging and dereference parent
     *  when child act is deallocated.
     *  ToDo: https://en.wikipedia.org/wiki/Parent_pointer_tree
     */
    var type_act = "Act";
    var symbol_act = make_symbol(type_act);
    var Act = /** @class */ (function () {
        function Act() {
        }
        return Act;
    }());
    function make_act(caller) {
        var address = allocate_bytes(words_per_cell + words_per_cell / 2);
        store_info(address, pack(5, fetch_info(caller)));
        // No local variables initially
        store_value(address, void_cell);
        // Store reference counter
        store32(address + words_per_cell, 1);
        return address;
    }
    function get_act_refcount(address) {
        return fetch(address + 8);
    }
    function set_act_refcount(address, count) {
        store_value(address, count);
    }
    var free_acts = void_cell;
    function allocate_act(caller) {
        if (free_acts == void_cell)
            return make_act(caller);
        var act = free_acts;
        free_acts = get_next_cell(act);
        store_info(act, pack(6, fetch_info(caller)));
        return act;
    }
    function free_act(act) {
        set_next_cell(act, free_acts);
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
    /* -----------------------------------------------------------------------
     *  Word, type 6
     *    the name is the id of the name of the word
     *    the value is the address where the word is defined is the VM memory
     */
    var type_word = "word";
    var symbol_word = make_symbol(type_word);
    // The dictionary of all words
    var next_word_id = 0;
    var all_words_by_id = Array();
    var all_word_flags_by_id = Array();
    var all_word_ids_by_name = new Map();
    function make_word(cell) {
        // Define a word. It's name is the name of the cell.
        // The cell's value is the adress where the definition starts.
        // The definition is an array of 16 bits words with primitive ids and
        // word ids. See run_fast() where the definition is interpreted.
        // ToDo: first 16 bits should be flags and length of code
        // ToDo: Forth also requires a pointer to the previous definition of
        // the word.
        var id = next_word_id++;
        var name = unpack_name(fetch_info(cell));
        var word_cell = make_cell(6, name, fetch_value(cell));
        all_words_by_id[id] = word_cell;
        all_word_ids_by_name.set(symbol_id_to_text(name), id);
        all_word_flags_by_id[id] = 0;
        return word_cell;
    }
    function get_word_by_id(id) {
        return all_words_by_id[id];
    }
    function word_name_to_text(id) {
        var word_cell = get_word_by_id(id);
        var name = get_cell_name(word_cell);
        var str_name = symbol_id_to_text(fetch_value(name));
        return str_name;
    }
    function get_word_definition(name) {
        // ToDo: implement header with flags, length and pointer to previous
        var id;
        var cell;
        if (all_word_ids_by_name.has(name)) {
            id = all_word_ids_by_name.get(name);
            cell = all_words_by_id[id];
        }
        else if (all_word_ids_by_name.has(name)) {
            id = all_primitive_ids_by_name.get(name);
            cell = all_primitives_by_id[id];
        }
        else {
            // Not found, return void cell, aka 0
            return void_cell;
        }
        return fetch_value(cell);
    }
    function get_word_definition_by_id(id) {
        var cell = all_words_by_id[id];
        return fetch_value(cell);
    }
    function set_word_immediate_flag(id) {
        all_word_flags_by_id[id] = 1;
    }
    function is_immediate_word(id) {
        return all_word_flags_by_id[id] == 1 ? 1 : 0;
    }
    /* -----------------------------------------------------------------------------
     *  Float, Array, Map, List
     */
    var type_float = "Float";
    var symbol_float = make_symbol(type_float);
    function make_float(value) {
        return make_cell(4, symbol_float, make_opaque_object(value));
    }
    var type_array = "Array";
    var symbol_array = make_symbol(type_array);
    function make_array(obj) {
        var array = obj;
        if (!obj) {
            array = new Array();
        }
        return make_cell(4, symbol_array, make_opaque_object(array));
    }
    var type_map = "Map";
    var symbol_map = make_symbol(type_map);
    function make_map(obj) {
        var map = obj;
        if (!obj) {
            map = new Map();
        }
        return make_cell(4, symbol_map, make_opaque_object(map));
    }
    var type_list = "List";
    var symbol_list = make_symbol(type_list);
    function make_list(obj) {
        // ToDo: value should a linked list of cells
        var list = obj;
        ;
        if (!obj) {
            list = new Array();
        }
        return make_cell(4, symbol_list, make_opaque_object(list));
    }
    /* --------------------------------------------------------------------------
     *  Task
     *  ToDo: make it a first class type?
     */
    var type_Task = "Task";
    var symbol_Task = make_symbol(type_Task);
    // Global state about currently running task
    var current_task;
    var current_ip;
    var current_rsp;
    var current_dsp;
    function push(cell) {
        // Push data on parameter stack
        current_dsp -= words_per_cell;
        store32(current_dsp, cell);
        de && bug("push /" + current_dsp + "/" + cell_to_text(cell));
    }
    function pop() {
        // Consume top of parameter stack
        var cell = load32(current_dsp);
        current_dsp += words_per_cell;
        de && bug("pop /" + current_dsp + "/" + cell_to_text(cell));
        return cell;
    }
    function get_it() {
        // Return top of stack
        de && bug("get_it /" + current_dsp + "/" + cell_to_text(load32(current_dsp)));
        return load32(current_dsp);
    }
    function set_it(cell) {
        store32(current_dsp, cell);
        de && bug("set_it /" + current_dsp + "/" + cell_to_text(cell));
    }
    var CpuContext = /** @class */ (function () {
        function CpuContext(ip, rsp, dsp) {
            this.ip = ip;
            this.dsp = dsp;
            this.rsp = rsp;
        }
        return CpuContext;
    }());
    var Task = /** @class */ (function () {
        function Task(parent, act, ip, ram_size) {
            // this.cell is set in make_task()
            this.cell = 0;
            // Parent task list, up to root task
            this.parent = parent;
            // Current activation for the new task
            this.act = act;
            // Init memory and cpu context
            this.init(ip, ram_size);
        }
        Task.prototype.init = function (ip, ram_size) {
            // Round size to the size of a cell
            var size = (ram_size / size_of_cell) * size_of_cell;
            // Current instruction pointer
            this.ip = ip;
            // Room for stacks, both data parameters and returns
            this.mp = allocate_bytes(size);
            // Return stack is at the very end
            this.rstack = this.mp + ((size / size_of_word) - words_per_value);
            // That's where the current return stack pointer is also
            this.rsp = this.rstack;
            // Parameter stack is just below the return stack
            this.dstack = this.rstack - (words_per_cell * 32);
            // That's where the current parameter stack pointer is
            this.dsp = this.dstack;
        };
        Task.prototype.get_context = function () {
            return new CpuContext(this.ip, this.rsp, this.dsp);
        };
        Task.prototype.restore_context = function (ctx) {
            current_task = this;
            current_ip = this.ip = ctx.ip;
            current_rsp = this.rsp = ctx.rsp;
            current_dsp = this.dsp = ctx.dsp;
        };
        return Task;
    }());
    function make_task(parent, act) {
        var size = 1024 * 16; // 1 kb, for parameters & returns stacks; ToDo
        var new_task = new Task(parent, 1, act, size);
        // Fill parameter stack with act's parameters
        // ToDo [ act.locals ];
        var cell = make_object(new_task);
        new_task.cell = cell;
        return cell;
    }
    ;
    // Current task is the root task
    var root_task = make_task(void_cell, void_cell);
    current_task = get_cell_opaque_object(root_task);
    // Current task changes at context switch
    task_switch(current_task);
    // There is nothing in the free list
    var free_tasks = void_cell;
    function allocate_task(parent, act) {
        if (free_tasks == void_cell)
            return make_task(parent, act);
        var task = free_tasks;
        var task_object = get_cell_opaque_object(task);
        task_object.ip = 1;
        task_object.parent = parent;
        task_object.act = act;
        return task;
    }
    function free_task(task) {
        // add task to free list
        set_next_cell(task, free_tasks);
        free_tasks = task;
    }
    // primitive to switch to another task
    function primitive_task_switch() {
        var next_task = this.get_it();
        task_switch(get_cell_opaque_object(next_task));
    }
    function task_switch(task) {
        task.restore_context(task.get_context());
    }
    function primitive_make_task() {
        var ip = fetch_value(this.get_it());
        var act = allocate_act(current_task.cell);
        var new_task = allocate_task(current_task.cell, act);
        // ToDo: push( parameters ); into new task
        var t = get_cell_opaque_object(new_task);
        t.ip = ip;
        this.set_it(make_cell(symbol_Task, symbol_Task, new_task));
    }
    ;
    // -----------------------------------------------------------------------
    //  primitives
    //
    var next_primitive_id = 0;
    var all_primitives_by_id = new Array();
    var all_primitive_fumctions_by_id = new Array();
    var all_primitive_ids_by_name = new Map();
    // Helper to define a primitive
    function primitive(name, fn) {
        var fcell = make_object(fn);
        var scell = make_symbol(name);
        // Make sure the name of the Function object is as desired
        store_cell(fcell, get_cell_type(fcell), get_cell_name(scell), fetch_value(fcell));
        // Assign a new primitive id to the new primitive
        var id = next_primitive_id++;
        // Associate name, primitive id and cell is all directions
        all_primitives_by_id[id] = fcell;
        all_primitive_fumctions_by_id[id] = fn;
        all_primitive_ids_by_name.set(name, id);
        // Make also some word that calls the primitives
        // 16 bits with the primitive id and 16 bits with "next" instruction code
        var bytes = allocate_bytes(4);
        store16(bytes, 0x4000 + id); // primitive
        store16(bytes + 1, 0x4000 + 1); // next
        store_value(scell, bytes);
        var word_cell = make_word(scell);
        // Restore the proper value of the symbol, a constant
        store_value(scell, id_symbol);
        de && mand(get_word_definition(name) == bytes);
        de && mand(load16(get_word_definition(name)) == (0x4000 + id));
        return word_cell;
    }
    // primitive with id 0 is nop, no operation
    primitive("no-operation", function no_operation() { });
    de && mand(load16(get_word_definition("no-operation")) == 0x4000);
    // primitive with id 1 is "next", jump to return address
    primitive("go-next", function go_next() {
        this.ip = load32(this.rsp);
        this.rsp += words_per_value;
    });
    // Bultin with id " is "juñp" to some relative position
    primitive("go-jump", function go_jump() {
        this.ip += load32(this.rsp);
    });
    primitive("make_task", primitive_make_task);
    primitive("task_switch", primitive_task_switch);
    // ToDo: core dictionary
    // Parameters stack manipulations
    primitive("push", function push() { this.push(); });
    primitive("pop", function pop() { this.pop(); });
    primitive("drop", function drop() { this.pop(); });
    primitive("dup", function dup() { this.push(this.get_it()); });
    function cell_to_text(cell) {
        var value = fetch_value(cell);
        var info = fetch_info(cell);
        var type = unpack_type(info);
        // Fast with text objects
        if (type == 3)
            return all_objects_by_id[value];
        var name = unpack_name(info);
        var buf = "";
        buf += type;
        buf += "/" + name + "/";
        buf += symbol_id_to_text(type) + "/";
        buf += symbol_id_to_text(name) + "/";
        switch (type) {
            case 0: break; // buf += "Void";
            case 1: // buf += "Symbol";
                buf += "/" + symbol_id_to_text(value);
                break;
            case 2: // buf += "Integer";
            case 3: // buf += "Text";
            case 4: // buf += "Object";
                if (all_objects_by_id[value]) {
                    var obj = all_objects_by_id[value];
                    buf += obj.toText();
                }
                else {
                    buf += "->?";
                }
                break;
            case 5:
                buf += "Function";
                break;
            case 6:
                buf += "Act";
                break;
            case 7:
                buf += "Word";
                break;
            default:
                buf += "???";
                break;
        }
        return buf;
    }
    function primitive_to_text() {
        var str = cell_to_text(this.get_it());
        this.set_it(make_text(str));
    }
    primitive("to_text", primitive_to_text);
    function primitive_log() {
        console.log(cell_to_text(this.get_it()));
    }
    primitive("log", primitive_log);
    var symbol_method_missing = make_symbol("method_missing");
    var void_token = {
        type: "",
        value: "",
        index: 0,
        line: 0,
        column: 0
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
    // ToDo: nesting multiline comments
    var comment_monoline_begin = "";
    var comment_monoline_begin_begin = "";
    var first_comment = true;
    function tokenizer_restart(source) {
        text = source;
        text_length = text.length;
        back_token = void_token;
        token_state = "base";
        text_cursor = 0;
        is_c_style = is_forth_style = is_lisp_style = false;
        first_comment = true;
        token_state = "comment";
    }
    tokenizer_restart(source);
    function make_token(type, value, ii) {
        return {
            type: type,
            value: value,
            index: ii - 1,
            line: 0,
            column: 0
        };
    }
    function unget_token(token) {
        back_token = token;
    }
    function get_next_token() {
        // Split source code into syntax tokens
        // ToDo: horn clauses, prolog syle
        // See http://tau-prolog.org/files/doc/grammar-specification.pdf
        // ToDo: lisp like nil and lists
        // See https://www.cs.cmu.edu/Groups/AI/html/cltl/clm/node9.html
        // ToDo: study Scheme implementations
        // See https://legacy.cs.indiana.edu/~dyb/pubs/3imp.pdf
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
        var is_eof = false; // End Of File
        // Some  lookahead to detect xxx's yyy and yyy of xxx syntax sugar
        // for xxx.yyy. That requires 4 characters
        // ToDo: use a "    " fixed size text?
        var next_ch = [" ", " ", " ", " "];
        function ch_is_space(ch) {
            // ToDo: avoid regexp
            return /\s/.test(ch.charAt(0));
        }
        function ch_is_eol(ch) {
            // ToDo: handle crlf better
            if (ch == "\n")
                return true;
            if (ch == "\r")
                return true;
            return false;
        }
        eat: while (true) {
            // EOF is like end of line
            if (ii == text_length) {
                is_eof = true;
                if (state == "base") {
                    token = { type: "eof", value: "", index: ii, line: 0, column: 0 };
                    break eat;
                }
                // Simulate an end of line
                ch = "\n";
                // Get next character in source
            }
            else {
                ch = text[ii];
                ii++;
            }
            // Is it somespace or something equivalent?
            is_space = ch_is_space(ch);
            is_eol = ch_is_eol(ch);
            // Also get next next chars, some lookahead helps sometimes
            for (var jj = 0; jj < 4; jj++) {
                if ((ii + jj) >= text_length) {
                    next_ch[jj] = " ";
                }
                else {
                    next_ch[jj] = text[ii + jj];
                    // Treat lf like a space
                    if (ch_is_eol(next_ch[jj])) {
                        next_ch[jj] = " ";
                    }
                }
            }
            // Collect comment
            if (state == "comment") {
                buf += ch;
                // When inside the first comment at the very beginning of the file
                if (first_comment && !is_space) {
                    // ToDo: skip #! shebang
                    // see https://en.wikipedia.org/wiki/Shebang_(Unix)
                    // C style of comment, either // or /* xxx */
                    if (ch == "/*" || ch == "//") {
                        is_c_style = true;
                        comment_multiline_begin = "/*";
                        comment_multiline_begin_begin = "/";
                        comment_multiline_end = "*/";
                        comment_multiline_end_end = "/";
                        comment_monoline_begin = "//";
                        comment_monoline_begin_begin = "/";
                        // Forth style, either \ or ( xxx )
                    }
                    else if (ch == "(") {
                        is_forth_style = true;
                        comment_multiline_begin = "(";
                        comment_multiline_begin_begin = "(";
                        comment_multiline_end = ")";
                        comment_multiline_end_end = ")";
                        comment_monoline_begin = "\\";
                        comment_monoline_begin_begin = "\\";
                        // Lisp style, ;
                    }
                    else if (ch == ";") {
                        is_lisp_style = true;
                        comment_monoline_begin = ";";
                        comment_monoline_begin_begin = ";";
                        // Prolog style, %
                    }
                    else if (ch == "%") {
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
                        value: buf.slice(comment_monoline_begin.length, buf.length - comment_monoline_begin.length),
                        index: ii,
                        line: 0,
                        column: 0
                    };
                    state = "base";
                    break eat;
                }
                // If this terminates the multiline comment, emit the comment
                if (ch == comment_multiline_end_end
                    && buf.slice(buf.length - comment_multiline_begin.length)
                        == comment_multiline_end
                    && buf.slice(0, comment_multiline_begin.length)
                        == comment_multiline_begin) {
                    // Emit token, without start & end of comment sequence
                    token = {
                        type: "comment_multiline",
                        value: buf.slice(comment_multiline_begin.length, buf.length
                            - comment_multiline_begin.length
                            - comment_multiline_end.length),
                        index: ii,
                        line: 0,
                        column: 0
                    };
                    state = "base";
                    break eat;
                }
                // Premature end of file, something else was expected
                if (is_eof) {
                    token = {
                        type: "error",
                        value: "eof in token " + state,
                        index: ii,
                        line: 0,
                        column: 0
                    };
                    break eat;
                }
                // Keep Collecting characters
                continue eat;
            }
            // Skip whitespaces
            if (state == "base") {
                // skip whitespaces
                if (is_space) {
                    continue eat;
                }
                // Texts starts with ", unless Forth
                if (ch == "\"" && !is_forth_style) {
                    // ToDo: handle single quote 'xx' and backquote `xxxx`
                    // ToDo: handle templates litterals
                    state = "text";
                    continue eat;
                }
                // ToDo: JSON starts with ~ ?
                // See https://www.json.org/json-en.html
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
            // Collect text until final "
            if (state == "text") {
                // End of text or end of file
                if (ch == "\""
                    || is_eof) {
                    token = {
                        type: "text",
                        value: buf,
                        index: ii,
                        line: 0,
                        column: 0
                    };
                    state = "base";
                    break eat;
                }
                // ToDo: handle escape sequences
                buf += ch;
                continue eat;
            } // text state
            // Collect word until separator
            if (state == "word") {
                // Spqce is a terminator
                if (is_space) {
                    // In Forth, things are pretty simple
                    if (is_forth_style) {
                        token = {
                            type: "word",
                            value: buf,
                            index: ii - 1,
                            line: 0,
                            column: 0
                        };
                        state = "base";
                        break eat;
                    }
                    // Normalize all whitespaces into a single space character
                    ch = " ";
                }
                // In Forth everthing between spaces is a word
                if (is_forth_style) {
                    buf += ch;
                    continue eat;
                }
                // Treat xxx( as if it were ( xxx. Hence ( fn 3 2 ) eqv fn( 3 2 )
                // Idem for xxx{ and xxx[
                // ToDo: idem? for xxx:, xxx, xxx; and xxx.
                // ToDo: idem? for ?, !
                // ToDo: quid @, &, #, $
                // ToDo: quid +, -, *, /
                // ToDo: quid <, >, =
                // ToDo: quid <xxx> yyy </xxx> ?
                // ToDo: quid ^, `
                // ToDo: generalize to anything special after alphanumeric sequence?
                // ToDo: act also depending on "known words" to enable some
                // special constructs like "if(" when it is a defined word.
                if ((ch == "(" || ch == '[' || ch == '{')
                    && buf.length > 0) {
                    unget_token({
                        type: ch,
                        value: ch,
                        index: ii,
                        line: 0,
                        column: 0
                    });
                    token = {
                        type: "word",
                        value: buf,
                        index: ii - 1,
                        line: 0,
                        column: 0
                    };
                    state = "base";
                    break eat;
                }
                // ToDo: detect yyy of xxx, meaning xxx.yyy
                // Some characters cannot be inside a word
                // ToDo: what about # ?
                if (ch == " "
                    || ch == "~" // ToDo: ?
                    || ch == "^" // ToDo: ?
                    || ch == "." // ToDo: dot notation where a.b( c ) eqv b( a, c )
                    || ch == "\\"
                    || ch == ":" // ToDo: what about :: ?
                    || ch == "." // ToDo: what about .. ?
                    || ch == ","
                    || ch == "'" // ToDo: detect xxx's
                    || ch == "'"
                    || ch == "`"
                    || ch == '"'
                    || ch == '(' // ToDo: what about ()
                    || ch == ')'
                    || ch == '[' //ToDo: what about [] ?
                    || ch == ']'
                    || ch == '{' // ToDo: trailing lambdas where { x... } ev do x... end
                    || ch == '}' // ToDo: what about {}, ){, ]} ?
                // ToDo: what about all two characters combinations with (, { and [ ?
                ) {
                    // Handle line continuation when \ is last character on line
                    if (ch == "\\"
                        && ch_is_eol(next_ch[0])) {
                        // Handle crlf
                        if (next_ch[0] == "\r") {
                            ii++;
                        }
                        // Skip lf
                        ii++;
                        continue eat;
                    }
                    // Either a word followed by some separator
                    if (buf.length) {
                        token = {
                            type: "word",
                            value: buf,
                            index: ii - 1,
                            line: 0,
                            column: 0
                        };
                        // Also push back a separator token unless it is just a space
                        if (ch != " ") {
                            // But only if there is a space right after it
                            if (next_ch[0] == " ")
                                unget_token({
                                    type: "post",
                                    value: ch,
                                    index: ii,
                                    line: 0,
                                    column: 0
                                });
                        }
                        // Or just the separator itself, with nothing before it
                    }
                    else {
                        token = {
                            type: "pre",
                            value: ch,
                            index: ii,
                            line: 0,
                            column: 0
                        };
                    }
                    // In both cases, emit a token and get back to normal
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
                index: ii,
                line: 0,
                column: 0
            };
            break eat;
        } // eat loop
        text_cursor = ii;
        token_state = state;
        return token;
    } // get_next_token()
    /* -----------------------------------------------------------------------
     *  run()
     */
    var InoxExecutionContext = /** @class */ (function () {
        function InoxExecutionContext() {
        }
        return InoxExecutionContext;
    }());
    function run_fast(ctx) {
        // This is the one function that needs to run fast.
        // It should be optimized by hand depending on the target CPU.
        // See https://muforth.nimblemachines.com/threaded-code/
        // Also http://www.ultratechnology.com/1xforth.htm
        // and http://www.bradrodriguez.com/papers/moving1.htm
        // Setup cpu context, instruction pointer, data & return stacks
        var ip = ctx.ip;
        var rsp = ctx.rsp;
        var dsp = ctx.dsp;
        // Top of stack optimization
        var it = get_it();
        // primitives can jump instead of just returning, aka chaining
        var then = 0;
        function push(cell) {
            // Push data on data parameter stack
            dsp -= words_per_cell; // size of cell pointer, 2 32 bits words
            store32(dsp, it);
            it = cell;
            de && bug("fast push /" + dsp + "/" + cell_to_text(it));
        }
        function pop() {
            // Consume top of the data parameter stack
            it = load32(dsp);
            dsp += words_per_cell; // size of cell pointer
            de && bug("fast pop /" + dsp + "/" + cell_to_text(it));
            return it;
        }
        // primitives have a limited access to the environment, but fast
        var inox = new InoxExecutionContext();
        inox.get_it = function get_it() { return it; };
        inox.get_ip = function get_ip() { return ip; };
        inox.get_rsp = function get_rsp() { return rsp; };
        inox.get_dsp = function get_dsp() { return dsp; };
        // ToDo gmp & tmp, global memory pointer and task memory pointer
        // ToDo ap, current Act pointer
        inox.set_ip = function set_ip(v) { ip = v; };
        inox.set_rsp = function set_rsp(v) { rsp = v; };
        inox.set_dsp = function set_dsp(v) { dsp = v; };
        inox.set_it = function set_it(v) { it = v; };
        inox.then = function set_then(v) { then = v; };
        inox.pop = pop;
        inox.push = push;
        inox.run = function run() { runner(); };
        inox.is_eval = 0; // false, see inox_eval(), it is true there
        function runner() {
            var word;
            var type;
            var code;
            var fun;
            while (true) {
                // Get 16 bits cell to execute and move forward
                word = load16(ip);
                // Special "go-next" primitive is just a jump to the return address
                if (word == 0x4001) {
                    // Jump to address poped from top of return stack
                    ip = load32(rsp);
                    // Exit loop if top of return stack reached
                    if (!ip)
                        break;
                    rsp += words_per_value; // size of InoxAddress, 2 16 bits words
                    continue;
                }
                //  what type of code this is, primitive or word
                type = word >>> 14;
                code = word & 0x3fff;
                // If code is a primitive, execute it
                if (type == 1) {
                    fun = all_primitive_fumctions_by_id[code];
                    while (true) {
                        fun.apply(inox);
                        // ToDo: then could be a code instead of a primitive id
                        if (!then)
                            break;
                        fun = all_primitive_fumctions_by_id[then];
                        then = 0;
                    }
                    ip++;
                    continue;
                    // Special "jump" codes to change the instruction pointer
                }
                else if (type == 2) {
                    // ToDo: relative jumps maybe
                    ip = code;
                    continue;
                }
                // else it is almost the address of some code to run
                // Push the next instruction pointer onto the return stack
                rsp -= words_per_value; // size of an InoxAddress, 2 16 bits words
                store32(rsp, ip + 1);
                // Jump to the word definition's address
                ip = get_word_definition_by_id(code);
                // ToDo: what about literals
            } // while ip
        } // run()
        runner();
        set_it(it);
        return new CpuContext(ip, rsp, dsp);
    } // run_fast()
    function run() {
        var old_ctx = new CpuContext(current_ip, current_rsp, current_dsp);
        var new_ctx = run_fast(old_ctx);
        current_ip = new_ctx.ip;
        current_dsp = new_ctx.dsp;
        current_rsp = new_ctx.rsp;
    }
    function run_word(word) {
        current_ip = get_word_definition(word);
        run();
    }
    function primitive_inox_eval() {
        var save_eval_mode = this.is_eval;
        this.is_eval = 1;
        var source = cell_to_text(this.get_it());
        tokenizer_restart(source);
        var token;
        var type;
        var value;
        var word;
        while (true) {
            token = get_next_token();
            type = token.type;
            value = token.value;
            de && bug("Token /" + type + "/" + value + "/");
            if (type == "word") {
                word = get_word_definition(value);
                // If known word, run it or add it to the new word beeing built
                if (word) {
                    // Immediate words are executed even when building a new word
                    // ToDo: compilation global flag
                    if (true || is_immediate_word(word)) {
                        this.set_ip(word);
                        this.run();
                        continue;
                    }
                    // Add word to word beeing built
                    continue;
                    // Else, this is a litteral, push it on the data stack
                }
                else {
                    this.push(make_text(value));
                }
                continue;
            }
            if (type == "error") {
                bug("Eval error " + value + " at " + token.index);
                break;
            }
            if (type == "eof") {
                break;
            }
        }
        this.is_eval = save_eval_mode;
    }
    primitive("inox-eval", primitive_inox_eval);
    // ToDo: restore state and provide event from json encoded values
    // The idea there is about code that can execute in a stateless manner
    // even when some state is required. Basically the whole state is
    // turned into an immutable value and Inox programs simply process
    // that value to produce another value that is a new state.
    // As a result every Inox program could run on any machine and
    // it would be the job of some "orchestration" layer to dispatch
    // jobs and propagate state changes harmoniouly. Not a simple task.
    var state = JSON.parse(json_state);
    var event = JSON.parse(json_event);
    // Compile the bootstrap vocabulary; ANSI Forth core
    var bootstrap_code = "( let's go forth )\n\n";
    set_it(make_text(bootstrap_code));
    var base_rsp = current_rsp;
    var base_dsp = current_dsp;
    function chk() {
        de && mand(load32(base_rsp) == 0);
        de && mand(current_rsp == base_rsp);
        de && mand(current_dsp == base_dsp);
    }
    chk();
    run_word("inox-eval");
    chk();
    // If source code was provided, push it on the parameter stack
    // See http://c2.com/cybords/pp4.cgi?muforth/README
    if (source) {
        set_it(make_text(source));
        chk();
        run_word("inox-eval");
        chk();
        run_word("inox-event-loop");
        chk();
    }
    // ToDo: return diff to apply instead of new state
    var new_state = state; // ToDo: encode top of stack in json
    return new_state;
}
/* --------------------------------------------------------------------------
 *  Smoke test
 */
inox("{}", "{}", [
    '( forth )',
    ': hello CR ." Hello world!" ;',
    'hello ;'
].join("\n"));
exports.inox = inox;