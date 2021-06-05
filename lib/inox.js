// inox.js
//   Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
// minimalist concatenative safe dynamic programming language.
// june 3 2021 by jhr

// Inox targets the webassembly virtual machine but runs on other architectures
// too. It is a multi dialect language because it values diversity.
//
// Entities:
// Cells - that's what memory is made of.
// Acts  - aka activation records or closures.
// Tasks - they run code in a cooperative manner.
//
// Values:
// Void      - void is void is void, no null vs undefined wars
// Undefined - pretty much like javascript's undefined.
// Nil,      - empty list, singleton.
// Symbols   - #such_names are efficient, both speed and memory usage
// Strings   - like in javascript
// Integers  - a kind of Number I guess, native size, minus decoration
// Floats    - another kind of numbers, huge
// Lists     - with an head and the rest
// Arrays    - indexed, 0 based
// Maps      - between symbols and arbitrary values
// Sets      - ToDo: reactive sets, see https://github.com/ReactiveSets/toubkal
// Objects   - the name of such type of values is the name of their class
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

function bug( msg ){
  console.log( msg );
}
var de = true;

de&&bug( "Inox starting..." );


//## dialect-javascript;
// This compilation directive tells the Inox compiler to switch to javascript
// ToDo: implement that dialect and make sure this current file complies to it.


  function inox( state, event, source ){
  // Starts running an Inox machine, returns a Promise of some future result,
  // The state and event parameters are decoded json structures.
  // The source parameter is a string, maybe the content of an .ino text file.

      const _ = undefined;

      // -----------------------------------------------------------------------
      //  Cell
      //

      function Cell( type, value, name ){

      // A memory cell has an address, a type, a value and a name maybe.
      // When the type is "list", the name is address of the rest of the list.
      // Note: some compact encoding would store all of that in a 64 bits word.

        this.type  = type;  // a ref to a Symbol type of cell
        this.name  = name;  // a ref to a Symbol type of cell xor next in list.
        this.value = value; // depends on type, often a pointer

        // Possible layouts :
        //  32 bits values, 8 bits types, 24 bits addresses, 4 bytes per cell
        //  40 bits values, 8 bits types, 16 bits addresses, 5 bytes per cell
        //  48 bits values, 4 bits types, 12 bits addresses, 6 bytes per cell
        // The layout could also vary according to the type.
      }

      function make_cell( type, value, name ){
        return new Cell( type, value, name );
      }

      function get_cell_type( cell ){
      // Returns the type of a cell, as a Symbol cell
        return cell.type;
      }

      function get_cell_name( cell ){
      // Returns the name of a cell, as a Symbol cell
        return cell.name;
      }

      function get_next_cell( cell ){
      // Assuming cell is a list member, return next cell in list
        return cell.name;
      }

      function set_next_cell( cell ){
      // Assuming cell is a list member, set the next cell in list
        cell.name =cell;
      }

      function get_cell_value( cell ){
      // Returns the opaque value of a cell, native word length
        return cell.value;
      }

      function get_cell_value64( cell ){
      // Returns the opaque value of a cell, double word
        return cell.value;
      }

      function get_cell_content( cell ){
      // Returns an array with 3 attributes of a cell, type/value/name
        return [
          cell.type,
          cell.name,
          cell.value,
        ];
      }

      function set_cell_content( target, source ){
      // Change the content of a cell
        target.type  = source.type;
        target.value = source.value;
        target.name  = source.name;
      }

      function set_cell_value( target, source ){
      // Change the content of a cell but keep the previous name
        target.type  = source.type;
        target.value = source.value;
      }

      // This is initialy the sentinel tail of reallocatable cells
      var free_cells = make_cell( _, _, _ );

      function alloc_cell( type, value, name ){
      // Allocate a new cell or reuse an free one
        var cell = free_cells;
        if( !cell.type )return make_cell( type, value, name );
        free_cells =  free_cells.value;
        cell.type  = type;
        cell.value = value;
        cell.name  = name;
        return cell;
      }

      function free_cell( cell ){
        cell.type = undefined;
        // ToDo: free any memory associated to the value
        cell.value = free_cells;
        free_cells = cell;
      }

      // -----------------------------------------------------------------------
      //  Symbol
      //

      const type_symbol = "Symbol";
      const all_symbols = {};

      function make_symbol( name ){
        var symbol = all_symbols[ name ];
        if( symbol )return symbol;
        symbol = alloc_cell( type_symbol, name, name );
        all_symbols[ name ] = symbol;
        return symbol;
      }

      const type_void   = "Void";
      const symbol_void = make_symbol( type_void );
      const void_value  = make_cell( type_void, _, _ );

      const symbol_symbol = make_symbol( type_symbol );


      // -----------------------------------------------------------------------
      //  String
      //

      const type_string = "String";
      const symbol_string = make_symbol( type_string );
      const small_strings = {};

      function make_string( value ){
        var string = small_strings[ value ];
        if( string )return string;
        string = alloc_cell( type_string, value, symbol_string )
        if( value.length() <= 1 ){
          small_strings[ value ] = string;
        }
        return string;
      }


      // -----------------------------------------------------------------------
      //  Integer
      //

      const type_integer = "Integer";
      const symbol_integer = make_symbol( type_integer );

      function make_integer( value ){
        return alloc_cell( type_integer, value, symbol_integer );
      }


      // -----------------------------------------------------------------------
      //  Float
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


      // -----------------------------------------------------------------------
      //  Task
      //

      function Task( act ){
      // Inox machines run cooperative tasks, actors typically,
        this.act = act;
        this.mem = [ act.locals ];  // Memory is made of adressable cells
        this.mp = 1;                // Memory pointer, in mem array, goes upward
        this.pp = 1023;             // Parameter pointer, goes downward
        this.ip = 2;                // Current interpreter pointer, in mem array
        this.stack = new Uint32Array( 32 ); // array of cell addresses
        this.sp = 0;                // Stack pointer for calls return
        this.builtins         = {}; // Name to function definition table
        this.words            = {}; // Name to address in memory
        this.compile_builtins = {}; // Idem but in compile mode
        this.compile_words    = {};
        this.parent = undefined     // Parent task
      }

      var make_task = function( parent, act ){
        var new_task = new Task( act );
        new_task.parent = parent;
        return new_task;
      };

      var task = make_task( undefined, root_act );
      var root_task = task;
      var free_tasks = task;

      function alloc_task( parent, act ){
        var task = free_tasks;
        if( ! task,ip )return make_task( parent, act );
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
        new_task.mem = task.mem;
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
        task.builtin[ name ] = fn;
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
+ 'hello "world"'
)

exports.Inox = Inox;
