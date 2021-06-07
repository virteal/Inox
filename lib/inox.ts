// inox.js
//   Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
// minimalist concatenative safe dynamic programming language.
//
// june 3 2021 by jhr
// june 7 2021 by jhr, move from .js to .ts, ie Typescript

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
//   Complex     - I know, sorry about that
//    Real       - whatever that means.
//     Rational  - Not so much
//      Integer  - a kind of Number I guess, native size, minus decoration
//      Unsigned - unsigned integers, eqv webassembly's usize
//      i8, u8, i6, u16, i32, u32, i64, u64 - webassembly
// Float         - another kind of numbers, huge
//  f32, f64     - webassembly
// v128          - webassembly
// Any           - webassembly's anyref
// Cell          - a pointer to a memory cell, type/name/value
// Address       - address of a byte in memory
// Object        - the name of such type of values is the name of their class
//   Box         - a proxy to a value typically
// Lists         - with an head and the rest, enumerable
//  Array        - indexed, 0 based
//   v128        - webassembly
//  String       - like in javascript, not 0 terminated like in C
//  Maps         - between symbols and arbitrary values
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


//## dialect-javascript;
// This compilation directive tells the Inox compiler to switch to javascript
// ToDo: implement that dialect and make sure this current file complies to it.

// my de&&bug darling
function bug( msg: string ){
  console.log( msg );
}
var de = true;

de&&bug( "Inox starting..." );

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
type i8    = number;
type ui8   = number;
type i16   = number;
type ui16  = number;
type i32   = number;
type ui32  = number;
type isize = number;
type usize = number;
type u64   = number;

// Some constants about memory layout
const MEM_SIZE = 1024 * 16;

  function inox( state: any, event: any, source: string ){
  // Starts running an Inox machine, returns a Promise of some future result,
  // The state and event parameters are decoded json structures.
  // The source parameter is a string, maybe the content of an .ino text file.

      const _ = 0; // undefined;

      // -----------------------------------------------------------------------
      //  Cell
      //

      type InoxAddress = ui32;
      type InoxType    = ui8;
      type InoxValue   = ui32;
      type InoxName    = ui16;

      type Cell = { type: InoxType, name: InoxName, value: InoxValue };

      // A memory cell has an address, a type, a value and a name maybe.
      // When the type is "list", the name is address of the rest of the list.
      // The encoding stores all of that in a 64 bits word.

      // this.type  = type;  // a ref to a Symbol type of cell
      // this.name  = name;  // a ref to a Symbol type of cell xor next in list.
      // this.value = value; // depends on type, often a pointer

      // Possible layouts :
      //  32 bits values, 8 bits types, 24 bits addresses, 4 bytes per cell
      //  40 bits values, 8 bits types, 16 bits addresses, 5 bytes per cell
      //  48 bits values, 4 bits types, 12 bits addresses, 6 bytes per cell
      // The layout could also vary according to the type.

      // cell number 0 is special, 0/0/0, void/void/void
      var next_cell: InoxAddress = 1;
      var ram = new Uint32Array( MEM_SIZE / 4 );

      function allocate_cell(): InoxAddress {
        return next_cell++;
      }

      function alloc_bytes( size: InoxValue ): InoxAddress {
        // Align on 64bits
        var aligned_size = ( size + 7 ) >> 3;
        var r = next_cell;
        next_cell += aligned_size;
        return r;
      }

      function make_cell(
        type: InoxType, name: InoxName, value: InoxValue
      ): InoxAddress {
        let address:InoxAddress = allocate_cell();
        store_cell( address, type, name, value );
        return address;
      }

      function store_cell(
        cell: InoxAddress, type: InoxType, value: InoxValue, name: InoxName
      ): InoxAddress {
        let address:InoxAddress = allocate_cell();
        let word1: ui32 = ( type << 16 ) + name;
        let word2: ui32 = value;
        ram.set( [ word1, word2 ], address);
        return address;
      }

     function fetch_cell( cell: InoxAddress ): Cell {
        let words = ram.slice( cell, 2 );
        let word1 = words[ 0 ];
        let word2 = words[ 1 ];
        let type  = word1 >> 16;
        let name  = word1 & 0xffff;
        let value = word2;
        return { type: type, name: name, value: value };
      }

      function get_cell_type( cell: Cell ): InoxType {
      // Returns the type of a cell, as a Symbol cell
        return cell.type;
      }

      function get_cell_name( cell: Cell ): InoxName {
      // Returns the name of a cell, as a Symbol cell
        return cell.name;
      }

      function get_next_cell( cell: Cell ): InoxAddress {
      // Assuming cell is a list member, return next cell in list
        var name: InoxName = cell.name;
        var address: InoxAddress = name << 3;
        return address;
      }

      function set_next_cell( cell: Cell, address: InoxAddress ): void {
      // Assuming cell is a list member, set the next cell in list
        cell.name = address >> 3;
      }

      function get_cell_value( cell: Cell ): usize {
      // Returns the opaque value of a cell, native word length
        return cell.value;
      }

      function get_cell_value64( cell: Cell ): u64 {
      // Returns the opaque value of a cell, double word
        return cell.value;
      }

      function set_cell_content( cell: Cell, source: Cell ): void {
      // Change the content of a cell
        cell.type  = source.type;
        cell.value = source.value;
        cell.name  = source.name;
      }

      function set_cell_value( cell: Cell, source: Cell ): void {
      // Change the content of a cell but keep the previous name
        cell.type  = source.type;
        cell.value = source.value;
      }

      function set_cell_name( cell: Cell, name: InoxName ){
      // Change the content of a cell but keep the previous name
        cell.name  = name;
      }

      // This is initialy the sentinel tail of reallocatable cells
      var free_cells: InoxAddress = allocate_cell();

      function fast_allocate_cell( type, value, name ){
      // Allocate a new cell or reuse an free one
        let address = free_cells;
        let cell: Cell
        = fetch_cell( get_next_cell( fetch_cell( free_cells ) ) );
        if( !cell.type )return make_cell( type, value, name );
        free_cells =  cell.value;
        cell.type  = type;
        cell.value = value;
        cell.name  = name;
        store_cell( address, type, name, value );
        return cell;
      }

      function free_cell( address: InoxAddress ){
      // free a cell, add it to the free cells list
        let cell: Cell = fetch_cell( address );
        // ToDo: define a type for free cells, instead of 1
        store_cell( address, 1, free_cells, 0 );
        free_cells = address;
      }

      // -----------------------------------------------------------------------
      //  Symbol & Void, type 1 & type 0
      //

      const type_symbol = "Symbol";
      const all_symbols = {};

      function make_symbol( name ){
        var symbol = all_symbols[ name ];
        if( symbol )return symbol;
        symbol = make_cell( 1, name, name );
        all_symbols[ name ] = symbol;
        return symbol;
      }

      const type_void   = "Void";
      const symbol_void = make_symbol( type_void );
      const void_value  = make_cell( 0, _, _ );

      const symbol_symbol = make_symbol( type_symbol );


      // -----------------------------------------------------------------------
      //  String, type 3
      //

      const type_string = "String";
      const symbol_string = make_symbol( type_string );
      const small_strings = {};

      function make_string( value ){
        var string = small_strings[ value ];
        if( string )return string;
        string = make_cell( 2, symbol_string, value )
        if( value.length() <= 1 ){
          small_strings[ value ] = string;
        }
        return string;
      }


      // -----------------------------------------------------------------------
      //  Integer, type 4
      //

      const type_integer = "Integer";
      const symbol_integer = make_symbol( type_integer );

      function make_integer( value ){
        let integer = make_cell( 4, symbol_integer, value );
      }


      // -----------------------------------------------------------------------
      //  Float, type 5
      //

      const type_float = "Float";
      const symbol_float = make_symbol( type_float );

      function make_float( value ){
        return alloc_cell( type_float, value, symbol_float );
      }


      // -----------------------------------------------------------------------
      //  List
      //

      const type_list = "List";
      const symbol_list = make_symbol( type_list );

      function make_list(){
        // ToDo: value should a linked list of cells
        return alloc_cell( type_list, [], symbol_list );
      }


      // -----------------------------------------------------------------------
      //  Array
      //

      const type_array = "Array";
      const symbol_array = make_symbol( type_array );

      function make_array(){
        // ToDo: value should be a slice inside the task's memory
        return alloc_cell( type_array, [], symbol_array );
      }


      // -----------------------------------------------------------------------
      //  Map
      //

      const type_map = "Map";
      const symbol_map = make_symbol( type_map );

      function make_map(){
        return alloc_cell( type_map, {}, symbol_map );
      }


      // -----------------------------------------------------------------------
      //  Object
      //

      const type_object = "Object";
      const symbol_object = make_symbol( type_object );

      function make_object( object ){
        var class_symbol = make_symbol( object.constructor.name );
        return alloc_cell( type_object, object, class_symbol );
      }


      // -----------------------------------------------------------------------
      //  Function
      //

      const type_function = "Function";
      const symbol_function = make_symbol( type_function );

      function make_function( fun ){
        var fun_symbol = make_symbol( fun.name );
        return alloc_cell( type_function, fun, symbol_function );
      }


      // -----------------------------------------------------------------------
      //  Act
      //

      function Act( parent ){
      // An Act is created for functions with local variables, aka closure
        this.parent = parent;
        this.count  = 1; // reference counter
        this.locals = make_cell();
        return this;
      }

      function make_act( parent ){
        return new Act( parent );
      }

      var free_acts = make_act();
      var root_act  = free_acts;

      function alloc_act( parent ){
        var act = free_acts;
        if( act.count )return make_act( parent );
        act.count = 1;
        free_acts = act.parent;
        act.parent = parent;
        return act;
      }

      function free_act( act ){
        act.parent = free_acts;
        free_acts = act;
      }

      function ref_act( act ){
        act.count++;
      }

      function deref_act( act ){
        act.count--;
        if( act.count !== 1 ) free_act( act );
      }


      /* -----------------------------------------------------------------------
       * Ram, random access memory
       *   An array of 32 bits words.
       * There should be machine code for this.
       */

      function Ram32( size ){
        this.size = size;
        this.mem  = new Uint32Array( size / 4 );
      }

      function make_ram32( size ){
      // Allocate ram, MMU's job usualy, Memory Management Unit
        return new Ram32( size );
      }

      function ram_get_byte( ram, address ){
        // ToDo: check out of range
        // if( address > ram.size )...
        var aligned_address = address >>> 2;
        var mem = ram.mem;
        var word32 = mem[ aligned_address ];
        var offset = address & 3;
        if( offset === 0 )return ( word32        ) & 255;
        if( offset === 1 )return ( word32 >>>  8 ) & 255;
        if( offset === 2 )return ( word32 >>> 16 ) & 255;
        return                   ( word32 >>> 24 ) & 255;
      }

      function ram_set_byte( ram, address, byte ){
        // ToDo: check out of range
        // if( address > ram.size )...
        var aligned_address = address >>> 2;
        var mem = ram.mem;
        var word32 = mem[ aligned_address ];
        var offset = address & 3;
        if( offset === 0 ){
          word32 = ( word32 & 0xfff0 ) | byte;
        }else if( offset === 1 ){
          word32 = ( word32 & 0xff0f ) | ( byte << 8 );
        }else if( offset === 1 ){
          word32 = ( word32 & 0xf0ff ) | ( byte << 16 );
        }else{
          word32 = ( word32 & 0xf0ff ) | ( byte << 24 );
        }
        mem[ aligned_address ] = word32;
      }

      function ram_get_word32( ram, address ){
        // ToDo: check out of range
        // if( address > ram.size )...
        var aligned_address = address >>> 2;
        return ram.mem[ aligned_address ];
      }

      function ram_set_word32( ram, address, word ){
        // ToDo: check out of range
        // if( address > ram.size )...
        var aligned_address = address >>> 2;
        return ram.mem[ aligned_address ] = word;
      }


      // -----------------------------------------------------------------------
      //  Task
      //

      function Task( parent, act, ram ){
      // Inox machines run cooperative tasks, actors typically,
        this.act = act;
        this.ram = ram;             // Memory is made of 32 bits words
        this.mp  = 0;               // Memory pointer, in ram array, goes upward
        this.pp = ram.size;         // Parameter pointer, goes downward
        this.ip = 0;                // Current interpreter pointer, in mem array
        this.stack = new Uint32Array( 32 ); // fast array of cell addresses
        this.sp = 0;                // Stack pointer for calls return
        this.builtins         = {}; // Name to function definition table
        this.words            = {}; // Name to address in memory
        this.compile_builtins = {}; // Idem but in compile mode
        this.compile_words    = {};
        this.parent = parent     // Parent task
      }

      var make_task = function( parent, act ){

        var size = 1024 * 32; // 32 kb

        if( parent ){
          size = parent.size;
        }

        var ram = make_ram32( size );
        var new_task = new Task( parent, act );

        // If parent task then copy memory from it
        if( parent ){
          // ToDo
        }
        // Fill parameter stack with act's parameters
        // ToDo [ act.locals ];

        return new_task;

      };

      var task = make_task( undefined, root_act );
      var root_task = task;
      var free_tasks = task;

      function alloc_task( parent, act ){
        var task = free_tasks;
        if( ! task.ip )return make_task( parent, act );
        task.ip = 1;
        task.parent = parent;
        task.act = act;
        return task;
      }

      function free_task( task ){
        task.parent = free_tasks;
        free_tasks = task;
      }

      // Push data on parameter stack
      function push( task, cell ){
        task.mem[ task.dp++ ] = cell;
      }

      // Builtin to make a new task
      task.builtins.make_task = function( task, ip ){
        var params = pop( task );
        var act = alloc
        var new_task = make_task( task );
        new_task.ram = task.mem;
        new_task.ip = ip;
        new_task.builtins = task.builtins;
        new_task.words = task.words;
        push( task, make_cell( type_task, new_task ) );
        return task;
      };

      // Consume top of parameter stack
      function task_pop( task ){
        return task.mem[ task.dp-- ];
      }

      // builtin to switch to another task
      function task_switch( task ){
        var new_task = pop( task );
        return new_task;
      }


      // -----------------------------------------------------------------------
      //  Builtins
      //

      // Helper to define a builtin
      function builtin( name, fn ){
        task.builtins[ name ] = fn;
      }

      // ToDo: core dictionary

      // Parameters stack manipulations
      builtin( "push", push ); // ToDo: fix, should be like dup
      builtin( "pop", pop );
      builtin( "dup", function( task ){
        // ToDo:optimize this
        var top = pop( task );
        push( task, top );
        push( task, top );
      } );
      builtin( "drop", pop );

      builtin( "log", function( task ){
        console.log( pop() );
      } );

      const symbol_method_missing = make_symbol( "method_missing" );
      const symbol_compile_method_missing
      = make_symbol( "compile_method_missing" );


      // -----------------------------------------------------------------------
      //  Tokenizer
      //

      var text = source;
      var text_length = text.length;
      var back_token  = _;
      var token_state = "base";
      var text_cursor = 0;

      function unget_token( token ){
        back_token = token;
      }

      function get_next_token(){

        var token = back_token;
        if( token ){
          back_token = _;
          return token;
        }

        var buf   = "";
        var sep   = "";
        var ii    = text_cursor;
        var state = token_state;
        var ch    = "";

        while( true ){

          // EOF
          if( ii === text_length ){
            if( state === "base" ){
              token = { type: "eof" }
              break;
            }
            token = { type: "error", error: "eof in get_next_token()" };
            break;
          }

          ch = text[ ii ];

          // Skip whitespaces
          if( state == "base" ){

            // skip whitespaces
            if( /\s/.test( ch.charAt( 0 ) ) ){
              ii++;
              continue;
            }

            if( ch == "\"" ){
              state = "string";
            }

            state = "collect";
            buf = ch;

          // Collect string until final "
          }else if( state === "string" ){
            if( ch == "\"" ){
              token = { type: "string", value: buf };
              ii++;
              state = "base";
              break;
            }
            ii++;
            buf += ch;

          // Collect word until separator
          }else if( state === "collect" ){

            if( /\s/.test( ch.charAt( 0 ) ) ){
              ch = " ";
            }

            // Treat xxx( as if it were ( xxx. Hence ( + 3 2 ) eqv +( 3 2 )
            if( ch == "(" && buf.length ){
              ii++;
              unget_token( { type: ch, separator: ch } );
              token =  { type: "word", word: buf } ;
              state = "base";
            }

            if( ch == " "
            ||  ch == "~"
            ||  ch == "^"
            ||  ch == "."
            ||  ch == "\\"
            ||  ch == ":"
            ||  ch == "."
            ||  ch == ","
            ||  ch == "'"
            ||  ch == "`"
            ||  ch == '"'
            ||  ch == '('
            ||  ch == ')'
            ||  ch == '['
            ||  ch == ']'
            ||  ch == '{'
            ||  ch == '}'
            ){
              ii++;
              unget_token( { type: ch, separator: ch } );
              token = { type: "word", word: buf };
              state = "base";
              break;
            }

            ii++;
            buf += ch;

          }else{
            token = { type: "error", error: "bad state in get_next_token()" };
            break;
          }

        }

        text_cursor = ii;
        token_state = state;
        return token;

      }


      // -----------------------------------------------------------------------
      //  Compiler
      //


      // -----------------------------------------------------------------------
      //  run()
      //

      function run( task ){
        // See https://muforth.nimblemachines.com/threaded-code/
        var cell;
        var op_type;
        var builtin_name;
        while( true ){

          // Get cell to execute and move forward
          cell = task.mem[ task.ip++ ];

          // Depending on cell's type
          op_type = cell.type;

          // If this is a builtin, execute it
          if( op_type == "builtin" ){
            builtin_name = cell.name;
            if( builtin_name == "next" ){
              // Jump to address on top of stack, lowering it
              task.ip = task.call_stack[ task.rp-- ];
              continue;
            }
            // ToDo: when compiling, lookup in q distinct dictionary
            task = task.builtins[ builtin_name ].apply( task, cell.value );
            if( !task )break;
            continue;
          }

          // If this is jump, do it
          if( op_type == "code" ){
            // Push return address
            task.call_stack[ task.rp++ ];
            // Jump to designated address
            task.ip = context.value;
            continue;
          }

          // Else it's data to push on the parameter stack, ie litterals
          task.mem[ task.pp-- ] = cell.value;
        }

      }

      // If source code was provided, compile it first
      // See http://c2.com/cybords/pp4.cgi?muforth/README
      if( source ){
        // Switch to compile time dictionary
        var builtins = task.builtins;
        var words = task.words;
        task.builtins = task.compile_builtins;
        task.words = task.compile_words;
        // ToDo: tokenizer
        run( task );
        task.builtins = builtins;
        task.words = words;
      }

      run( task );

      // ToDo: return diff to apply instead of new state
      return new_state;

    }


// -----------------------------------------------------------------------------
// Smoke test
//

inox( undefined, undefined,
  "forth-dialect ;"
+ ": hello log ;"
+ '"world" hello ;'
)

exports.Inox = Inox;
