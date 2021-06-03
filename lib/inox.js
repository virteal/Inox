function inox(){
    // Inox is a basic/forth/smalltalk/lisp/erlang inspired minimalist safe dynamic programming language.
    // It targets the webassembly virtual machine but runs on other architectures too.
    // @jhr, june 3 20121.
    //
    // This is the reference implementation. It defines the syntax and semantic of the language.
    // Production quality version of the virtual machine would have to be hard coded in some machine code to
    // be efficient.
    
      // Source code to execute
      var src = ': hello log ; hello: "world!" ;';
    
      function cell(){
        this.type  = undefined;
        this.name  = undefined;
        this.value = undefined;
      }
    
      function make_cell( type, name, value ){
      // A memory cell has an address, a type, a name and a value
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
    
      // Memory iq made of adressable cells
      var mem = [];
    
      // Stack, a small array of cell addresses
      var call_stack = new Uint32Array( 32 );

      // ToDo: use classic forth terminology
      // SP - the parameter Stack Pointer
      // RP - the Return stack Pointer
      // IP - the Interpreter Pointer
      // UP - the User Pointer (base address of the user area)
    
      // Stack pointer for calls return
      var rp = 0;
    
      // Data pointer, in mem array
      var dp = 512;
    
      // Current interpreter pointer, in mem array
      var ip = 0;
    
      // Run
      // See https://muforth.nimblemachines.com/threaded-code/
      var operation_type;
      var current_cell;
      while( true ){
        current_cell = mem
        operation_type
      }
    
    }
    