// inox.js
// Inox is a multi dialect basic/forth/smalltalk/lisp/erlang inspired
// minimalist safe dynamic programming language.
// It targets the webassembly virtual machine but runs on other
// architectures too.
// It is a multi dialect language because it values diversity.
//   june 3 3031 by jhr


  function inox( state, event, source ){
    // This is the reference implementation. It defines the syntax and semantic
    // of the language.
    // Production quality version of the virtual machine would have to be hard
    // coded in some machine code to
    // be efficient.

      function cell(){
        this.type  = undefined;
        this.name  = undefined;
        this.value = undefined;
      }

      function make_cell( type, value, name ){
      // A memory cell has an address, a type, a value and a name maybe.
      // When the type is "list", the name is address of the rest of the list.
      // Note: some compact encoding would store all of that in a 32 bits word.
        var cell = new cell();
        cell.type = type;
        if( name ){
          cell.name = name;
        }else{
          cell.name = type;
        }
        cell.value = value;
        return cell;
      }

      function task(){
        this.mem = [];        // Memory is made of adressable cells
        this.call_stack = new Uint32Array( 32 ); // array of cell addresses
        this.rp = 0;          // Stack pointer for calls return
        this.dp = 0;          // Data pointer, in mem array, goes upward
        this.pp = 1023;       // Parameter pointer, in mem array, goes downward
        this.ip = 0;          // Current interpreter pointer, in mem array
        this.builtins = {};   // Name to function definition table
        this.words = {};      // Name to address in memory
        this.parent = undefined // Parent task
      }

      var make_task = function( parent ){
        var new_task = new task();
        new_task.parent = parent;
        return new_task;
      };

      var task = make_task();

      // Push on parameter stack
      function push( task, cell ){
        task.mem[ task.dp++ ] = cell;
      }

      // Builtin to make a new task
      task.builtins.make_task = function( task, ip ){
        var new_task = make_task( task );
        new_task.mem = task.mem;
        new_task.ip = ip;
        new_task.builtins = task.builtins;
        new_task.words = task.words;
        push( task, make_cell( "task", new_task ) );
        return task;
      };

      // Consume top of parameter stack
      function pop( task ){
        return task.mem[ task.dp-- ];
      }

      // builtin to switch to another task
      task.builtin.switch_task = function( task ){
        var new_task = pop( task );
        return new_task;
      }

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
  }

// Smoke test
inox( undefined, undefined,
  "forth-dialect ;"
+ ": hello log ;"
+ 'hello "world"'
)
