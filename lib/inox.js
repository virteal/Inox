// inox.js
//   Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
// minimalist concatenative safe dynamic programming language.
// june 3 2021 by jhr

// Inox targets the webassembly virtual machine but runs on other architectures
// too. It is a multi dialect language because it values diversity.
//
// Entities:
// Cells - that's what memory is make of.
// Acts - aka activation records or closures.
// Tasks - they run code in a cooperative manner,

  function inox( state, event, source ){
    // This is the reference implementation. It defines the syntax and semantic
    // of the language.
    // Production quality version of the virtual machine would have to be hard
    // coded in some machine code to be efficient.


      function Cell(){
        this.type  = undefined;
        this.name  = undefined;
        this.value = undefined;
      }

      function make_cell( type, value, name ){
      // A memory cell has an address, a type, a value and a name maybe.
      // When the type is "list", the name is address of the rest of the list.
      // Note: some compact encoding would store all of that in a 32 bits word.
        var cell = new Cell();
        cell.type = type;
        if( name ){
          cell.name = name;
        }else{
          cell.name = type;
        }
        cell.value = value;
        return cell;
      }

      var free_cells = make_cell();

      function alloc_cell( type, value, name ){
        var cell = free_cells;
        if( cell.type )return make_cell();
        cell.type = type;
        cell.value = value;
        cell.name = name;
        return cell;
      }

      function free_cell( cell ){
        cell.type = undefined;
        // ToDo: free any memory associated to the value
        cell.value = free_cells;
        free_cells = cell;
      }


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
        if( ! act.count == 1 ) free_act( act );
      }


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
      var free_tasks = make_task( root_task );

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
      var root_act = act_list;

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
        if( ! act.count == 1 ) free_act( act );
      }

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
