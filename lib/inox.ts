/*  inox.ts
 *    Inox is a concatenative script language
 *
 *  june      3 2021 by jhr
 *  june      7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 *  june     10 2021 by jhr, .nox file extension
 *  june     27 2021 by jhr, forth hello world is ok, literate comment in Inox
 *  july     17 2021 by jhr, turing complete
 *  july     28 2021 by jhr, use 64 bits instructions, code and data unification
 *  october  10 2021 by jhr, source code cleanup
 *  december  7 2022 by jhr, class, object, malloc/free, refcount gc
 *  decembre 26 2022 by jhr, reactive dataflows and reactive sets from Toubkal
 *  january  29 2023 by jhr, crossed the 10 000 lines of code frontier
 *  february 27 2023 by jhr, runs in C++, 15Kloc, 95 Mips
 */

/* ----------------------------------------------------------------------------
 *  Cross platform.
 *
 *  This source file is processed in various ways in order to produce multiple
 *  targets. The first target is the reference implementation, a virtual machine
 *  that runs on the web browser and on node.js. It's written in Typescript.
 *  Work is in progress to produce a second target, a C++ version.
 *
 *  The source code is written in Typescript. It's a superset of Javascript.
 *  It's syntax is close to AssemblyScript, Java and C++, ie C style.
 *
 *  There is no macro processor in Typescript, so the source code is anotated
 *  with special comments processed to produce the other targets, specially the
 *  C++ target. See build_targets() below.
 */
 //  /**/        to ignore the rest of the line when in C++
 //  /*a*/       to ignore the rest of the line when in AssemblyScript
 //  //c/ xxxx   to include code when in C++ only, mono line
 //  //a/ xxxx   to include code when in AssemblyScript only, mono line
 //  /*!c{*/     to switch to generic code
 //  /*c{        to switch to C++ specific code
 //  /*}{        to switch from generic Typescript to C++ specific code
 //  }{*/        to switch from C++ to Typescript specific code
 //  }*/         to switch from C++ to generic code
/*
 *  On Windows, using cl.exe, the compiler flags in debug mode are:
 *  "/DWIN32",
 *  "/DEBUG",
 *  "/nologo",
 *  "/utf-8",
 *  /Zi",
 *  "/JMC",
 *  /EHsc",
 *  "/fsanitize=address",
 *  "/std:c++latest",
 */

/*c{

// ToDo: remove unused includes
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <stdbool.h>
#include <stdint.h>
#include <math.h>
using namespace std;

// Windows is not Unix
#ifdef _WIN32

#include <windows.h>

#define O_RDONLY 1

int open( const char* path, int mode ){
  // Read only mode is the only mode supported, for now
  if( mode != O_RDONLY )return -1;
  // Windows version to open a file in read only mode
  HANDLE file_handle = CreateFileA(
    path,
    GENERIC_READ,
    FILE_SHARE_READ,
    NULL,
    OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL,
    NULL
  );
  if( file_handle == INVALID_HANDLE_VALUE )return -1;
  return (int) file_handle;
}


int close( int fd ){
  // Windows version to close a file
  if( fd <= 0 )return 0;
  HANDLE file_handle = (HANDLE) fd;
  CloseHandle( file_handle );
  return 0;
}


int read( int fd, void* buf, int count ){
  DWORD read_count;
  if( fd != 0 )return -1;
  HANDLE stdin_handle = GetStdHandle( STD_INPUT_HANDLE );
  if( stdin_handle == INVALID_HANDLE_VALUE )return -1;
  ReadFile( stdin_handle, buf, count, &read_count, NULL );
  return (int) read_count;
}


int write( int fd, const void* buf, int count ){
  DWORD written_count;
  if( fd != 1 && fd != 2 )return -1;
  HANDLE h = GetStdHandle( fd == 1 ? STD_OUTPUT_HANDLE : STD_ERROR_HANDLE );
  if( h == INVALID_HANDLE_VALUE )return -1;
  WriteFile( h, buf, count, &written_count, NULL );
  return (int) written_count;
}

#else
  #include <unistd.h>
#endif

}*/


/*
 *  Startup time is important these days, let's measure it.
 *  Inox is designed to run "at the edge", on IoT devices, but also in
 *  the cloud. Running some Inox code somewhere should be fast because
 *  the code to run has a very small granularity. It's not like running
 *  a whole web page, or a whole application. It's more like running a lot
 *  of functions, the so called "serverless" way.
 *  Ultimately, the network becomes the computer.
 */

/**/  const now = Date.now;

// In the old days, circa 1990, gettimeofday() was the way to measure time.
// It's still available on Linux, but it's not portable. The chrono library
// is the way to go these days. It's available on Linux, Windows and Mac.

/*c{

#include <chrono>
using namespace std::chrono;

// There is also an int_now() function defined below, it uses a 32 bits
// integer to express the number of milliseconds since epoch, where
// the epoch is the time when the program started instead of the some
// older time that requires a 64 bits integer to express the time now.

std::chrono::milliseconds now( void ){
  std::chrono::time_point t = high_resolution_clock::now();
  duration te = t.time_since_epoch();
  std::chrono::milliseconds te_ms = duration_cast< milliseconds >( te );
  return te_ms;
}

}*/


/**/  const time_start = now();
/**/  let   time_started = 0;
/*c{
  std::chrono::milliseconds time_start = now();
  std::chrono::milliseconds time_started;
}*/


/*
 *  This is the reference implementation. It defines the syntax and semantic
 *  of the language. Production quality version of the virtual machine would
 *  have to be hard coded in some machine code to be efficient I guess.
 */

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
/**/ type u8  = number;
/**/ type u32 = number;
/**/ type i32 = number;


// This code is supposed to be compiled in 32 bits mode. This means that
// all pointers are 32 bits, including pointers returned by malloc() & co.
// There is little need for a 64 bits version at this time (2023). If it were
// to exist, if would make sense to also move cells from 64 bits to 128 bits.

/*c{

#define USE_INT_ONLY
#ifdef  USE_INT_ONLY
  #define     u8              int
  #define     u32             int
  #define     i32             int
  // Macro to convert an integer into a pointer
  // #define     cast_ptr( p )   ( (int*) (p) )
  #define     cast_ptr( p )   ( reinterpret_cast<u32*>( p ) )
#else
  #define USE_STDINT_H 1
  #ifdef USE_STDINT_H
    #define   u8              uint8_t
    #define   u32             uint32_t
    #define   i32             int32_t
    #define   cast_ptr( p )   ( (int32_t*) (p) )
  #else
    typedef   unsigned int    u8;
    typedef   unsigned int    u32;
    typedef   int             i32;
    #define   cast_ptr( p )   ( (int*) (p) )
  #endif
#endif

#define boolean bool

}*/

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

// Address of a cell's value, type and name
/**/ type    Cell = i32;
//c/ #define Cell   i32

// Smallest entities at an address in memory
/**/ type    InoxWord = i32;
//c/ #define InoxWord   i32

// Index in rather small arrays usually, usually positive
/**/ type    Index = i32;
//c/ #define Index   i32

// A counter, not negative usually
/**/ type    Count = i32;
//c/ #define Count   i32

// Size of something, in bytes
/**/ type    Size = i32;
//c/ #define Size   i32

// Size in number of items, often cells
/**/ type    Length  = i32;
//c/ #define Length    i32

// 0 is false, 1 or anything else is true
/**/ type    Boolean = i32;
//c/ #define Boolean   i32

// Short floating point number, 32 bits
/**/ type    Float = number;
//c/ #define Float   float

// Proxy objects have a unique id, currently an address in the heap
/**/ type    InoxOid = i32;
//c/ #define InoxOid   i32

// Payload of cell. ToDo: should be an int32
/**/ type    Value = i32;
//c/ #define Value   i32

// Type & name info parts of a cell
/**/ type    Info = u32;
//c/ #define Info   i32

// Packed with name, 4 bits, at most 16 types
/**/ type    Type = u8;
//c/ #define Type   u8

// 28 bits, type + name makes info, total is 32 bits
/**/ type    Name = i32;
//c/ #define Name   i32

// Synonym for Name. ToDo: should be the address of a definition
/**/ type    Tag = i32;
//c/ #define Tag   i32

// Shorthand for string, 4 vs 6 letters
/**/ type    Text = string;
//c/ #define Text       LeanString
//c/ #define TxtD( s )  LeanString( s )

// Like Text, but const
/**/ type TxtC        = string;
/**/ type ConstText   = string;
//c/ #define TxtC       const char*
//c/ #define ConstText  const LeanString&

/**/ type            Primitive = () => void;
//c/ typedef void ( *Primitive )( void );

// any is for proxied objects only at this time
//c/ #define any const void*


/* -----------------------------------------------------------------------------
 *  Let's go.
 *   Some debugging tools first.
 */

/**/  import    assert from "assert";
//c/ #include <assert.h>

/*
 *  My de&&bug darling, a debug function that can be disabled for speed.
 *  Usage: de&&bug( a_message );
 *
 *  The trick is to use the progressive && operator to disable the call
 *  to the bug() function when the 'de' variable is set to false.
 *
 *  This is not as efficient as a macro, but it's portable and it makes
 *  it possible to define multiple debug levels or categories, aka 'domains'.
 *
 *  The 'de' variable is a global flag that can be set to true or false.
 *  It should be false in production, true in development. Once the code
 *  is stable, it should be possible to remove all the de&&bug() calls but
 *  this require some external tooling that would transpile the code.
 */

// Conditional compilation of debug domains
/*c{

// INOX_FAST is without debug and without any other checks, for max speed
#ifdef INOX_FAST
  #define INOX_NDE
  #define INOX_MEM_NDE
  #define INOX_ALLOC_NDE
  #define INOX_CHECK_NDE
  #define INOX_EVAL_NDE
  #define INOX_RUN_NDE
  #define INOX_PARSE_NDE
  #define INOX_TOKEN_NDE
  #define INOX_STACK_NDE
  #define INOX_BLABLA_NDE
  #define INOX_WARN_NDE
  #define INOX_STEP_NDE
#endif

#ifdef INOX_DE
  #undef INOX_NDE
#endif

#ifdef INOX_MEM_DE
  #undef INOX_MEM_NDE
#endif

#ifdef INOX_ALLOC_DE
  #undef INOX_ALLOC_NDE
#endif

#ifdef INOX_CHECK_DE
  #undef INOX_CHECK_NDE
#endif

#if !defined( INOX_EVAL_NDE ) && !defined( INOX_EVAL_DE )
  #define INOX_EVAL_DE
  #undef  INOX_EVAL_NDE
#endif
#ifdef INOX_EVAL_DE
  #undef INOX_EVAL_NDE
#endif

#if !defined( INOX_RUN_NDE ) && !defined( INOX_RUN_DE )
  #define INOX_RUN_DE
  #undef  INOX_RUN_NDE
#endif
#ifdef INOX_RUN_DE
  #undef INOX_RUN_NDE
#endif

#if !defined( INOX_TOKEN_NDE ) && !defined( INOX_TOKEN_DE )
  #define INOX_TOKEN_DE
  #undef  INOX_TOKEN_NDE
#endif
#ifdef INOX_TOKEN_DE
  #undef INOX_TOKEN_NDE
#endif

#if !defined( INOX_PARSE_NDE ) && !defined( INOX_PARSE_DE )
  #define INOX_PARSE_DE
  #undef  INOX_PARSE_NDE
#endif
#ifdef INOX_PARSE_DE
  #undef INOX_PARSE_NDE
#endif

#if !defined( INOX_STACK_NDE ) && !defined( INOX_STACK_DE )
  #define INOX_STACK_DE
  #undef  INOX_STACK_NDE
#endif
#ifdef INOX_STACK_DE
  #undef INOX_STACK_NDE
#endif

#if !defined( INOX_BLABLA_NDE ) && !defined( INOX_BLABLA_DE )
  #define INOX_BLABLA_DE
  #undef  INOX_BLABLA_NDE
#endif
#ifdef INOX_BLABLA_DE
  #undef INOX_BLABLA_NDE
#endif

#if !defined( INOX_STEP_NDE ) && !defined( INOX_STEP_DE )
  #define INOX_STEP_DE
  #undef  INOX_STEP_NDE
#endif
#ifdef INOX_STEP_DE
  #undef INOX_STEP_NDE
#endif


}*/


/**/ let de = true;
/*c{
  // In "fast" mode, 'de' flag cannot be activated at runtime
  #ifdef INOX_NDE
    #define de false
  #else
    static bool de = true;
  #endif
}*/


// not debug. To easely comment out a de&&bug, simply add a n prefix
/**/ const   nde = false;
//c/ #define nde   false


/*
 *  This source file uses multiple debug domains, aka categories.
 *  Some of them are purely there for development, some are useful
 *  for production.
 */


/*
 *  'blabla' is a verbose debug domain to debug the interpreter itself.
 *  It should be disabled in production.
 */

/**/ let blabla_de = false;
/*c{
  // In "fast" mode, 'blabla_de' flag cannot be activated at runtime
  #ifdef INOX_BLABLA_NDE
    #define blabla_de false
  #else
    static bool blabla_de = false;
  #endif
}*/


/*
 *  'mem_de' is a low level memory access debug domain.
 *  It should be disabled in production.
 */

/**/ let mem_de = true;
/*c{
  // In "fast" mode, 'mem_de' flag cannot be activated at runtime
  #ifdef INOX_MEM_NDE
    #define mem_de false
  #else
    static bool mem_de = true;
  #endif
}*/


/*
 *  'alloc_de' is there to help debug the dynamic memory allocator.
 *  It should be disabled in production. Among other things, it performs
 *  some integrity checks on the heap.
 */

/**/ let alloc_de = true;
/*c{
  // In "fast" mode, 'alloc_de' flag cannot be activated at runtime
  #ifdef INOX_ALLOC_NDE
    #define alloc_de false
  #else
    static bool alloc_de = true;
  #endif
}*/


/*
 *  'check_de' is about runtime error checking.
 *  It may be disabled in production if the source code is trusted.
 *  If the source code may raise typing errors or some other errors,
 *  then it should be enabled in production. Code without checking
 *  runs faster.
 */

/**/ let check_de = true;
/*c{
  // In "fast" mode, 'check_de' flag cannot be activated at runtime
  #ifdef INOX_CHECK_NDE
    #define check_de false
  #else
    static bool check_de = true;
  #endif
}*/


/*
 *  'warn_de' is about warning messages that are not errors but look like
 *  they could be errors. It's useful to debug the code that is responsible
 *  for raising warnings.
 *  It should be disabled in production.
 */

/**/ let warn_de = true;
/*c{
  // In "fast" mode, 'warn_de' flag cannot be activated at runtime
  #ifdef INOX_WARN_NDE
    #define warn_de false
  #else
    static bool warn_de = true;
  #endif
}*/


/* -----------------------------------------------------------------------------
 *  The other debug domains are pure trace domains. They enable/disable
 *  verbose traces about various aspects of the execution of the code.
 *  They should be disabled in production.
 *  They are useful for development and debugging only.
 */


/*
 *  'token_de' enables traces about tokenization. This is the first step
 *  of the compilation process. It's useful to debug the tokenizer that
 *  is responsible for splitting the source code into tokens.
 */

/**/ let token_de = false;
/*c{
  // In "fast" mode, 'token_de' flag cannot be activated at runtime
  #ifdef INOX_TOKEN_NDE
    #define token_de false
  #else
    static bool token_de = false;
  #endif
}*/


/*
 *  'parse_de' enables traces about parsing. This is the second step
 *  of the compilation process. It's useful to debug the parser that
 *  is responsible for compiling verb definitions. As in Forth, the
 *  parser is also an evaluator that runs the source code when it is
 *  not defining a verb.
 */

/**/ let parse_de = false;
/*c{
  // In "fast" mode, 'parse_de' flag cannot be activated at runtime
  #ifdef INOX_PARSE_NDE
    #define parse_de false
  #else
    static bool parse_de = false;
  #endif
}*/


/*
 *  'eval_de' enables traces about evaluation. This is mixed with parsing
 *  because the parser is also an evaluator. It's useful to debug the
 *  parser/evaluator that is used for the REPL, the interactive mode with
 *  the read-eval-print loop.
 */

/**/ let eval_de = false;
/*c{
  // In "fast" mode, 'eval_de' flag cannot be activated at runtime
  #ifdef INOX_EVAL_NDE
    #define eval_de false
  #else
    static bool eval_de = false;
  #endif
}*/


/*
 *  'run_de' enable trace is about execution. It's useful to debug the
 *  verb runner that is responsible for executing the code that was
 *  compiled by the parser when defining verbs.
 */

/**/ let run_de = false;
/*c{
  // In "fast" mode, 'run_de' flag cannot be activated at runtime
  #ifdef INOX_RUN_NDE
    #define run_de false
  #else
    static bool run_de = false;
  #endif
}*/


/*
 *  'stack_de' enables traces about the stacks. It's useful to debug
 *  changes to the stacks. Note that this flag does not command the
 *  stack overflow/underflow checking, it only enables traces about the stacks.
 */

/**/ let stack_de = false;
/*c{
  // In "fast" mode, 'stack_de' flag cannot be activated at runtime
  #ifdef INOX_STACK_NDE
    #define stack_de false
  #else
    static bool stack_de = false;
  #endif
}*/


/*
 *  'step_de' enables traces about the execution of each step of both
 *  the parser/evaluator and the verb runner. It enables step by step
 *  debugging of the code.
 */

/**/ let step_de = false;
/*c{
  // In "fast" mode, 'step_de' flag cannot be activated at runtime
  #ifdef INOX_STEP_NDE
    #define step_de false
  #else
    static bool step_de = false;
  #endif
}*/


/* ----------------------------------------------------------------------------
 *  First, let's define what kind of debugging we want. debug() is maximal,
 *  no_debug() is minimal, no_debug_at_all() is without any checking of
 *  both types and memory, fast but perilous.
 *  The default should normally be no_debug().
 */

/*
 *  Global flag to filter out all console.log until one needs them
 *  See log primitive to enable/disable traces.
 */

let can_log = true;


/* ----------------------------------------------------------------------------
 *  Let's define the three main modes of operation depending on the debug
 *  level, ie Inox machine debugging, application debugging or production.
 */


/*
 *  Kernel mode, with lots of traces and step by step debugging.
 *  This is the mode when debugging the Inox interpretor itself.
 */

function debug(){
  can_log = true;
  /**/ de = mem_de = alloc_de = true;
  /*c{
    #ifndef INOX_NDE
      de = true;
    #endif
    #ifndef INOX_MEM_NDE
      mem_de = true;
    #endif
    #ifndef INOX_ALLOC_NDE
      alloc_de = true;
    #endif
    #ifndef INOX_CHECK_NDE
      check_de = true;
    #endif
    #ifndef INOX_WARN_NDE
      warn_de = true;
    #endif
    #ifndef INOX_BLABLA_NDE
      blabla_de = true;
    #endif
    #ifndef INOX_TOKEN_NDE
      token_de = true;
    #endif
    #ifndef INOX_PARSE_NDE
      parse_de = true;
    #endif
    #ifndef INOX_EVAL_NDE
      eval_de = true;
    #endif
    #ifndef INOX_RUN_NDE
      run_de = true;
    #endif
    #ifndef INOX_STACK_NDE
      stack_de = true;
    #endif
    #ifndef INOX_STEP_NDE
      step_de = false; // Not always convenient in C++
    #endif
  }*/
}


/*
 *  Normal mode, with error checking only, no traces.
 *  This is the mode when debugging an application written in Inox.
 *  It's also the mode when running the application in production unless
 *  the application is fully trusted.
 */

function no_debug(){
  debug();
  /**/ blabla_de = false;
  /**/ token_de = parse_de = eval_de = run_de = stack_de = step_de = false;
  /*c{
    #ifndef INOX_BLABLA_NDE
      blabla_de = false;
    #endif
    #ifndef INOX_TOKEN_NDE
      token_de = false;
    #endif
    #ifndef INOX_PARSE_NDE
      parse_de = false;
    #endif
    #ifndef INOX_EVAL_NDE
      eval_de = false;
    #endif
    #ifndef INOX_RUN_NDE
      run_de = false;
    #endif
    #ifndef INOX_STACK_NDE
      stack_de = false;
    #endif
    #ifndef INOX_STEP_NDE
      step_de = false;
    #endif
  }*/
}


/*
 *  Fast mode, no type checking, no traces. This is the mode when running
 *  the application in production if the application is fully trusted.
 *  It's also the mode when running the application in production if some
 *  orchestration layer monitors the execution and catches errors.
 */

function no_debug_at_all(){
  no_debug();
  /**/ de = mem_de = alloc_de = false;
  /*c{
    #ifndef INOX_NDE
      de = false;
    #endif
    #ifndef INOX_MEM_NDE
      mem_de = false;
    #endif
    #ifndef INOX_ALLOC_NDE
      alloc_de = false;
    #endif
  }*/
  check_de = false;
}


function init_debug() : Index {
  let retcode = 0;
  // no_debug_at_all();
  // no_debug(); retcode = 1;
  debug(); retcode = 2;
  //c/ step_de = false; // Not always convenient for debugging in C++
  return retcode;
}

// 0 = no_debug_at_all(), 1 = no_debug(), 2 = debug()
const debug_level = init_debug();


/* ----------------------------------------------------------------------------
 *  How to invoke the debugger from the code
 */

/*c{

#ifdef _WIN32

  #include <intrin.h>
  #define debugger __debugbreak()

#else

  void debugger_function( void ){
  // Invoke the debugger if there is one, platform dependent
    // ToDo: test this on Linux and Mac
    #ifdef __EMSCRIPTEN__
      emscripten_debugger();
    #else
      #ifdef __APPLE__
        __asm__("int $3\n" : : );
      #else
        // ToDo: how to invoke the debugger on other platforms?
      #endif
    #endif
  }

  #define debugger debugger_function()

#endif

}*/


/* ----------------------------------------------------------------------------
 *  Forward declarations to please C++. The functions are defined later.
 *  In Typescript references to functions can be used before they are defined.
 */

// Forward declarations to please C++
/*c{
bool  mand_eq( Value, Value );
bool  trace( char* );
void  trace_context( TxtC );
void  FATAL( TxtC msg );
bool  mand_cell_type( Cell, Index );
bool  mand_cell_name( Cell, Tag );
bool  mand_empty_cell( Cell );
bool  mand_tos_is_in_bounds( void );
bool  mand_csp_is_in_bounds( void );
int   init_cells_allocator( void );
Cell  allocate_cell( void );
Cell  allocate_cells( Count );
void  free_cell( Cell );
void  free_cells( Cell, Count );
int   init_areas_allocator( void );
Cell  allocate_area( Count );
void  free_area( Cell );
bool  is_safe_area( Cell );
bool  is_busy_area( Cell );
Size  area_size( Cell );
Count area_capacity( Cell );
void  set_next_cell( Cell, Cell );
bool  is_valid_tag( Tag );
bool  is_a_tag_cell( Cell );
bool  is_a_tag_singleton( Cell );
bool  is_a_reference_cell( Cell );
bool  needs_clear( Cell );
void  clear( Cell );
Index object_length( Cell );
void  free_text( Index );
void  free_proxy( Index );
Cell  get_reference( Cell );
void  increment_object_ref_count( Cell );
void  decrement_object_ref_count( Cell );
bool  is_last_reference_to_area( Cell );
Cell  stack_preallocate( Length );
Count stack_length( Cell );
bool  stack_is_extended( Cell );
void  stack_push( Cell, Cell );
void  stack_put( Cell, Index, Cell );
void  stack_put_copy( Cell, Index, Cell );
Cell  stack_at( Cell, Index );
void  stack_extend( Cell, Length );
bool  cell_looks_safe( Cell );
void  set_return_cell( Cell );
Cell  PUSH( void );
Cell  POP( void );
void  push_integer( Value );
Cell  make_proxy( any );
void  set_proxy_cell( Cell, Cell );
void  primitive_clear_control( void );
void  primitive_clear_data( void );
Cell  definition( Tag );
Tag   type_to_tag( Index );
Index tag_to_type( Tag );
Count block_length( Cell );
void  primitive_if( void );
void  primitive_run( void );
void  primitive_noop( void );
void  set_style( TxtC );
void  eval_do_literal( void );
void  eval_do_machine_code( Tag );
void  eval_quote_next_token( void );
bool  eval_is_expecting_the_verb_name( void );
void  process_comment_state( void );
void  process_word_state( void );
bool  parsing( Index );
Primitive get_primitive( Tag );

}*/

/* -----------------------------------------------------------------------------
 *  The Inox interpreter's memory inside the CPU's one.
 *  The Typescript version uses a single big ArrayBuffer.
 *  The C++ version uses calloc() linked chunks.
 */

// This is "the data segment" of the virtual machine.
// the "void" first cell is allocated at absolute address 0.
// It's an array of 64 bits words indexed using 28 bits addresses.
// That's a 31 bits address space, 2 giga bytes, plenty.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html


// That the flat memory where the Inox interpretor will run
// ToDo: make the size configurable at run time
// Current default is 256 KB
/**/ const   INOX_HEAP_SIZE =   1024 * 256;
//c/ #define INOX_HEAP_SIZE   ( 1024 * 256 )

// cell number 0 is reserved, special, 0/0/0, void/void/void
// It should never be accessed, but it is used as a default value.
// If accidentely accessed, this may raise an hardware exception
const cell_0 = 0;

// Some basic memory allocation, LIFO oriented
// This is like sbrk() on Unix
// See https://en.wikipedia.org/wiki/Sbrk
// Smart pointers use a malloc/free scheme with reference counters.

// This last cell would be HERE in Forth
// See https://forth-standard.org/standard/core/HERE
let the_next_free_cell = 0;

// The very first cell is not 0 when running in C++, see init_cells()
let the_very_first_cell = 0;

// There is also an upper limit, see init_cells() too
let the_free_cell_limit = 0;

// The memory is accessed differently depending on the target
/**/ let mem    = new ArrayBuffer( INOX_HEAP_SIZE  ); // 256 kb
/**/ let mem8   = new Uint8Array(   mem );
/**/ let mem32  = new Int32Array(   mem );
/**/ let mem32f = new Float32Array( mem );
// ToDo: with AssemblyScript const mem64 = new Int64Array( mem );

// Linked list of free byte areas, see init_areas_allocator()
let the_first_free_area = 0;

let the_empty_text_cell = 0;

// Having a tempory cell is convenient sometimes
let the_tmp_cell = 0;

// A few global variables need to be initialized soon.
// That's mainly for debugging purposes.
// They are documented better close to where they are used.
let all_symbol_cells = 0;
let all_symbol_cells_length = 0;
let tag_list = 0; // Will become tag( "list" ) asap


/* -----------------------------------------------------------------------------
 *  logging/tracing
 */

// Faster access to console.log
/**/ const console_log = console.log;

/*
 *  Global flag to filter out all console.log until one needs them.
 *  See log primitive to enable/disable traces.
 */

/**/  let     bug = !can_log ? trace : console_log;
//c/ #define  bug( a_message ) ( trace( a_message ) )


/*
 *  trace() is the default trace function. It's a no-op if can_log is false.
 *  It's a wrapper around console.log() if can_log is true.
 *  In C++, console_log() uses write()
 */

/**/ function trace( msg ) : boolean {
/**/    // de&&bug( a_message ) to log a message using console.log()
/**/    if( !can_log ){
/**/      // See primitive log
/**/      bug = console_log;
/**/      return true;
/**/    }
/**/    // AssemblyScript supports a simpler version of console.log()
/**/    assert( typeof msg == "string" );
/**/    console_log( msg );
/**/    return true;
/**/  }


/*c{

bool trace( char* msg ){
  if( !can_log )return true;
  // 1 is stdout
  int len = strlen( msg );
  msg[ len ] = '\n';
  write( 1,msg, len + 1 );
  return true;
}

// Hack to avoid a strange recursive call to trace() in C++
bool trace_c_str( char* msg ){
  return trace( msg );
}

}*/


function breakpoint(){
  debugger;
  trace_context( "BREAKPOINT\n" );
  debugger;
}


/* ----------------------------------------------------------------------------
 *  'mand' is short for "demand" or "mandatory". It's functions that check
 *  if some condition is true. If it's not, it raises an exception. This
 *  implements assertions checking.
 *  There are various flavors of mand() to check various types of conditions.
 */


function mand( condition : boolean ) : boolean {
// de&&mand( a_condition ), aka asserts. Return true if assertion fails.
  // ToDo: should raise an exception?
  if( condition )return true;
  breakpoint();
  assert( false );
  return false;
};


/**/function mand2( condition : boolean, msg : TxtC ) : boolean {
//c/ bool    mand2( bool condition,      char* msg ){
// Like mand() but with a message
  if( condition )return true;
  bug( msg );
  breakpoint();
  assert( false );
  return false;
}

// Hack to avoid a strange recursion
/*c{
bool mand2_c_str( bool condition, char* msg ){
  return mand2( condition, msg );
}
}*/


/* -----------------------------------------------------------------------------
 *  First, make it work in the javascript machine, it's the portable scheme.
 *  When compiled using AssemblyScript some changes will be required.
 */

/**/ de&&bug( "Inox is starting." );


/* -----------------------------------------------------------------------------
 *  Memory is made of words that contains cells. Cells are made of a value and
 *  informations, info. Info is the type and the name of the value. See pack().
 */

/**/ const   size_of_word    = 8;  // 8 bytes, 64 bits
//c/ #define size_of_word      8

/**/ const   size_of_value   = 4;  // 4 bytes, 32 bits
//c/ #define size_of_value     4

/**/ const   size_of_cell    =   2 * size_of_value;
//c/ #define size_of_cell      ( 2 * size_of_value )

// Cell addresses to byte pointers and vice versa, aligned on cell boundaries
/**/ function to_cell( a_ptr : number  ) : Cell   {  return a_ptr    >> 3;  }
//c/ #define  to_cell( a_ptr )         ( (Cell)   ( ( (u32) a_ptr )  >> 3 ) )
/**/ function to_ptr(  a_cell  : Cell  ) : number {  return a_cell   << 3;  }
//c/ #define  to_ptr( a_cell )         ( (char*)  ( ( (u32) a_cell ) << 3 ) )

/**/ const   words_per_cell  =   size_of_cell  / size_of_word;
//c/ #define words_per_cell    ( size_of_cell  / size_of_word )

/**/ const   ONE             = words_per_cell;
//c/ #define ONE               words_per_cell

// Other layouts could work too. 2 bytes word, 4 bytes value, 2 bytes info.
// This would make 6 bytes long cells instead of 8. ok for a 32 bits cpu.
// 4 bytes cells using 2 bytes word, 2 bytes value & 2 bytes info.
// This would mean short integers and names, ok for an ESP32 style cpu.


/* ---------------------------------------------------------------------------
 *  Low level memory management.
 *  The Inox virtual machine uses an array of 32 bits words to store both
 *  the content of "cells" (2 words) and arrays of "code tokens" (2 words). A
 *  cell is the basic value manipulated everywhere. A code is a token that
 *  reference either a javascript defined primitive or an user defined verb.
 *  The notion of user defined "verbs" comes from the Forth language.
 *  This is like user defined functions in classical languages except that
 *  there is no formal parameters, the data stack is the parameter.
 *  Classical functions can be built over that basic mechanism using local
 *  variables stored in the control stack, dynamic scope at this point.
 */


// -----------------------------------------------------------------------------
// ToDo: if( PORTABLE ){

// Portable versions of access to memory using "cells" and "words".
// For the webassembly version, see https://wasmbyexample.dev/examples/webassembly-linear-memory/webassembly-linear-memory.assemblyscript.en-us.html


// Write access to that cell triggers a debugger breakpoint in debug mode
let breakpoint_cell = 1;

/*
 *  set_value() and set_info() are the only way to write to memory
 */

function set_value( c : Cell, v : Value ){
   if( de && c == breakpoint_cell )debugger;
   /**/ mem32[ c << 1 ] = v |0;
   //c/ *cast_ptr( to_ptr( c ) ) = v;
}


function set_info( c : Cell, i : Info  ){
  if( de && c == breakpoint_cell )debugger;
  /**/ mem32[ ( c << 1 ) + 1 ] = i |0;
  //c/ *cast_ptr( to_ptr( c ) + size_of_value ) = i;
}


/*
 *  value() and info() are the only way to read from memory
 */

function value( c : Cell ) : Value {
  // return mem64[ c ] & 0xffffffff
  /**/ return mem32[ c << 1 ] |0;
  //c/ return *cast_ptr( to_ptr( c ) );
}


function info( c : Cell ) : Info {
  // return mem64[ c ] >>> 32;
  /**/ return mem32[ (     c << 1 ) + 1 ] |0;
  //c/ return *cast_ptr( to_ptr( c ) + size_of_value );
}


/*
 *  reset() is the way to clear a cell
 */

function reset( c : Cell ){
  if( de && c == breakpoint_cell )debugger;
  // mem64[ c ] = 0;
  /**/ mem32[       c << 1       ] = 0;
  /**/ mem32[     ( c << 1 ) + 1 ] = 0;
  //c/ *cast_ptr( to_ptr( c )                 ) = 0;
  //c/ *cast_ptr( to_ptr( c ) + size_of_value ) = 0;
}


/*
 *  reset_value()
 */

function reset_value( c : Cell ) : void {
  if( de && c == breakpoint_cell )debugger;
  /**/ mem32[     c << 1 ] = 0;
  //c/ *cast_ptr( to_ptr( c ) ) = 0;
}


/*
 *  reset_info()
 */

function reset_info( c : Cell ) : void {
  if( de && c == breakpoint_cell )debugger;
  /**/ mem32[     ( c << 1 ) + 1 ] = 0;
  //c/ *cast_ptr( ( to_ptr( c ) ) + size_of_value ) = 0;
}


/*
 *  init_cell() to initialize a cell to zeros
 */

function init_cell( c : Cell, v : Value, i : Info ){
  if( de && c == breakpoint_cell )debugger;
  // mem64[ c ] = v | ( i << 32 );
  /**/ mem32[       c << 1       ]              = v |0;
  /**/ mem32[     ( c << 1 ) + 1 ]              = i |0;
  //c/ *cast_ptr( to_ptr( c )                 ) = v;
  //c/ *cast_ptr( to_ptr( c ) + size_of_value ) = i;
}


/*
 *  init_copy_cell() to initialize a cell to the value of another one
 */

function init_copy_cell( dst : Cell, src : Cell ){
// Initialize a cell, using another one, raw copy.
  if( de && dst == breakpoint_cell )debugger;
  /**/ const dst1 = dst << 1;
  /**/ const src1 = src << 1;
  /**/ mem32[ dst1     ] = mem32[ src1     ] |0;
  /**/ mem32[ dst1 + 1 ] = mem32[ src1 + 1 ] |0;
  //c/ auto dst4 = to_ptr( dst );
  //c/ auto src4 = to_ptr( src );
  //c/ *cast_ptr( dst4                 ) = *cast_ptr( src4                 );
  //c/ *cast_ptr( dst4 + size_of_value ) = *cast_ptr( src4 + size_of_value );
}


/*
 *  packing and unpacking of type and name
 */

// Not on metal
/*!c{*/

function pack( t : Type, n : Tag ) : Info { return n | t << 28;              }
function unpack_type( i : Info )   : Type { return i >>> 28;                 }
function unpack_name( i : Info )   : Tag  { return i & 0xffffff;	           }
function type( c : Cell )          : Type { return unpack_type( info( c ) ); }
function name( c : Cell )          : Tag  { return unpack_name( info( c ) ); }

// On metal
/*}{

#define pack( t, n )       ( ( n ) | ( ( t ) << 28 ) )
#define unpack_type( i )   ( ( ( u32) i ) >> 28 )
#define unpack_name( i )   ( ( i ) & 0xffffff )
#define type( c )          ( unpack_type( info( c ) ) )
#define name( c )          ( unpack_name( info( c ) ) )

}*/

/*
 *  set_type() and set_name()
 */

function set_type( c : Cell, t : Type ){
// The type of the singleton tag cell that defines the tag must never change
  if( de && is_a_tag_cell( c ) && is_a_tag_singleton( c ) ){
    // Tag void is the exception, it's type is 0, aka void.
    if( c == 0 ){
      de&&mand_eq( t, 0 );
     }else{
       de&&mand_eq( t, 1 );
     }
   }
  set_info( c, pack( t, unpack_name( info( c ) ) ) );
}


function set_name( c : Cell, n : Tag ){
// The name of the tag cell that defines the tag must never change.
  if( de && type( c ) == 2 /* type_tag */ && c == value( c ) ){
    de&&mand_eq( n, c );
  }
  set_info( c, pack( unpack_type( info( c ) ), n ) );
}

/*
 *  small test suite for pack() and unpack()
 */

// Not on metal
/*!c{*/

function test_pack(){
  // copilot generated code
  de&&mand( pack( 0, 0 ) == 0 );
  de&&mand( pack( 1, 0 ) == 1 << 28 );
  de&&mand( pack( 0, 1 ) == 1 );
  de&&mand( pack( 1, 1 ) == ( 1 << 28 ) + 1 );
  de&&mand( unpack_type( pack( 0, 0 ) ) == 0 );
  de&&mand( unpack_type( pack( 1, 0 ) ) == 1 );
  de&&mand( unpack_type( pack( 0, 1 ) ) == 0 );
  de&&mand( unpack_type( pack( 1, 1 ) ) == 1 );
  de&&mand( unpack_name( pack( 0, 0 ) ) == 0 );
  de&&mand( unpack_name( pack( 1, 0 ) ) == 0 );
  de&&mand( unpack_name( pack( 0, 1 ) ) == 1 );
  de&&mand( unpack_name( pack( 1, 1 ) ) == 1 );
  const test_cell = 0;
  const save_breakpoint = breakpoint_cell;
  breakpoint_cell = 1;
  set_value( test_cell, 0 );
  de&&mand( value( test_cell ) == 0 );
  set_value( test_cell, 1 );
  de&&mand( value( test_cell ) == 1 );
  set_info( test_cell, 0 );
  de&&mand( info( test_cell ) == 0 );
  set_info( test_cell, 1 );
  de&&mand( info( test_cell ) == 1 );
  init_cell( test_cell, 0, 0 );
  de&&mand( value( test_cell ) == 0 );
  de&&mand( info( test_cell ) == 0 );
  init_cell( test_cell, 1, 1 );
  de&&mand( value( test_cell ) == 1 );
  de&&mand( info( test_cell ) == 1 );
  init_cell( test_cell, 0, 1 );
  de&&mand( value( test_cell ) == 0 );
  de&&mand( info( test_cell ) == 1 );
  init_cell( test_cell, 1, 0 );
  de&&mand( value( test_cell ) == 1 );
  de&&mand( info( test_cell ) == 0 );
  reset( 0 );
  de&&mand( value( test_cell ) == 0 );
  de&&mand( info( test_cell ) == 0 );
  breakpoint_cell = save_breakpoint;
 }
 test_pack(); // Better fail early.

/*}*/


/* -----------------------------------------------------------------------------
 *  Not portable version is AssemblyScript syntax.
 *  ToDo: figure out what @inline means exactly
 *  ToDo: figure out some solution to avoid the right shift when
 *  optimizing for speed instead of for memory
 *  The resulting vm would then have access to less cells,
 *  1/16 of them, but faster.
 */

/* if( ! PORTABLE ){
@inline function load32( index : u32 ) :u32 {
  return load< u32 >( index << 3 );
}
@inline function store32( index : u3, value : i32 ) :void {
  store< InoxValue >( index << 3, value );
}
*/


/* -----------------------------------------------------------------------------
 *  Cell
 *
 *  A memory cell seats at an address and has a type, a value and a name.
 *  When the name is "list", the value is the address of the rest of the list.
 *  Else the name is a "tag", a fixed abritrary value. In some languages
 *  like Lisp tags are called "atoms" or "symbols".
 *
 *  The encoding stores all of that in a 64 bits word.
 *  cell's type is a numeric id, 0..15
 *  cell's name is the address of a tag type of cell.
 *  cell's value depends on type, often an integer or the address of a cell.
 *
 *  eqv C like struct Cell_t {
 *    value : i32;
 *    info  : u32;
 *  };
  *
  *  This architecture, with named values, is classicaly called a
  *  tagged architecture.
  *  See https://en.wikipedia.org/wiki/Tagged_architecture
  */

// In this implementation, the name is a 28 bits pointer that points
// to 64 bits words, this is equivalent to a 31 bits pointer
// pointing to bytes. That's 2 giga bytes or 256 millions of cells.
//
// I used these named values 30 years ago, when I designed the
// object oriented version of a scriting language named Emul. It was
// used in a single project, a network supervision system named SAGE.
// SAGE managed X25 devices that could interop with the french public
// data network named Transpac. The Minitel national program used that
// network to serve 1200 bauds clients using X25 connected servers.
// It all exploded when Internet arrived, circa 1995 approximatly.
// I survived. That makes me a software "veteran" I guesss.


/*
 *  Cell types
 */

/**/ const   type_void       = 0;
//c/ #define type_void         0

/**/ const   type_boolean    = 1;
//c/ #define type_boolean      1

/**/ const   type_tag        = 2;
//c/ #define type_tag          2

/**/ const   type_integer    = 3;
//c/ #define type_integer      3

/**/ const   type_verb       = 4;
//c/ #define type_verb         4

/**/ const   type_float      = 5;
//c/ #define type_float        5

/**/ const   type_reference  = 6;
//c/ #define type_reference    6

/**/ const   type_proxy      = 7;
//c/ #define type_proxy        7

/**/ const   type_text       = 8;
//c/ #define type_text         8

/**/ const   type_flow       = 9;
//c/ #define type_flow         9

/**/ const   type_list       = 10;
//c/ #define type_list         10

// ToDo: study ranges, see https://accu.org/conf-docs/PDFs_2009/AndreiAlexandrescu_iterators-must-go.pdf
/**/ const   type_range      = 11;
//c/ #define type_range        11

/**/ const   type_invalid    = 12;
//c/ #define type_invalid      12


/* -----------------------------------------------------------------------------
 *  LeanString implementation.
 *  This is a minimal implementation of dynamiccally alllocated strings.
 *  It is for all versions, both Typescript, AssemblyScript and C++.
 *  It initially stores the strings using allocate_cells() and then moves to
 *  using allocate_area() as soon as possible during bootstrap.
 *
 *  Each lean string is made of a two cells header plus the bytes of
 *  the string plus one byte set to 0 for C string compatibility when needed.
 *  That's a total of 3 cells for a string of 0 to 7 bytes and then
 *  another cell for each consecutive 8 bytes.
 *
 *  Note: using a common format for strings makes it possible to communicate
 *  between the C++, Typescript and the AssemblyScript version with ease.
 *  That the string representation is also C compatible makes it easy to
 *  interface Inox with C code.
 */

// ToDo: endianness should be detected at compile time, how?
// See https://developer.mozilla.org/en-US/docs/Glossary/Endianness
// See https://stackoverflow.com/questions/1001307/detecting-endianness-programmatically-in-a-c-program

/**/ const is_big_endian = false;
//c/ #define is_big_endian false

/**/ let in_lean_mode    = true;
//c/ static bool in_lean_mode = true;

// ToDo: the magic number should be bigger than any expected string
// That's because memory_dump() detects strings by looking for the magic number
/**/ const lean_magic_number = 0x8234561;
//c/ #define lean_magic_number 0x8234561


// Declared here to avoid access before initialization
let debug_next_allocate = 0;

// Linked list of free cells.
let the_first_free_cell = 0;

// The basic cell allocator is needed, let's initialize it now
const init_cells_allocator_done = init_cells_allocator();


function lean_aligned_cell_length( len : Length ) : Length {
  // Add padding to align on size of cell
  const padded_len = ( len + size_of_cell - 1 ) & ~( size_of_cell - 1 );
  return to_cell( padded_len );
}


function lean_header( cell : Cell ) : Cell {
  return cell - 2 * ONE;
}


function is_lean( cell : Cell ) : boolean {
  return value( lean_header( cell ) ) == lean_magic_number;
}


function lean_allocate_cells( ncells : Index ) : Cell {
// Allocate cells, each cell can hold size_of_cell bytes, ie 8.
  if( in_lean_mode ){
    // Add space for the fake headers
    ncells += 2;
    const header = allocate_cells( ncells );
    // Header 0 may become a reference counter, for now it is a magic number
    set_value( header + 0 * ONE, lean_magic_number );
    // Header 1 is total size in bytes, including the two headers, aligned
    set_value( header + 1 * ONE, ncells * size_of_cell );
    const cell = header + 2 * ONE;
    alloc_de&&mand( is_lean( cell ) );
    return cell;
  }else{
    return allocate_area( ncells );
  }
}


function lean_free( cell : Cell ){
  // Clear the content of the string
  const header = lean_header( cell );
  const is_area = ! is_lean( cell );
  const sz = value( header + 1 * ONE );
  const ncells = to_cell( sz );
  const limit = lean_header( cell ) + ncells;
  let ii = header;
  while( ii < limit ){
    reset( ii );
    ii += ONE;
  }
  // Use either the area allocator or the cell allocator
  if( ! is_area ){
    free_cells( header, ncells );
  }else{
    free_area( cell );
  }
}


function lean_byte_at( cell : Cell, index : Index ) : Value {
  // Typescript version uses the mem8 view on the memory buffer
  /**/ return mem8[ to_ptr( cell ) + index ]
  // AssemblyScript version uses the load<u8> function
  //a/ return load<u8>( to_ptr( cell ) + index );
  // C++ version uses the memory buffer directly
  // ToDo: on ESP32 some memory regions are not byte adressable,
  // hence the bytes should be extracted from 32 bits words
  //c/ return *(char*)  ( to_ptr( cell ) + index );
}


function lean_byte_at_put( cell : Cell, index : Index, val : Value ){
  // Typescript version uses the mem8 view on the memory buffer
  /**/ mem8[ to_ptr( cell ) + index ] = val & 0xFF;
  // AssemblyScript version uses the store<u8> function
  //a/ store<u8>( to_ptr( cell ) + index, val & 0xFF );
  // C++ version uses the memory buffer directly
  // On ESP32, some memory regions are not byte adressable,
  // hence the bytes should be inserted into 32 bits words
  //c/ *(char*) ( to_ptr( cell ) + index ) = val & 0xFF;
  alloc_de&&mand_eq( lean_byte_at( cell, index ), val );
}


function lean_byte_at_from( d : Cell, d_i : Index, s : Cell, s_i : Index ){
  // Typescript version uses the mem8 view on the memory buffer
  /**/ mem8[      to_ptr( d ) + d_i ] = mem8[      to_ptr( s ) + s_i ];
  // AssemblyScript version uses the store<u8> function
  //a/ store<u8>( to_ptr( d ) + d_i,    load<u8>(  to_ptr( s ) + s_i ) );
  // C++ version uses char pointers directly
  //c/ *(char*) ( to_ptr( d ) + d_i ) = *(char*) ( to_ptr( s ) + s_i );
}


function lean_strlen( cell : Cell ) : Length {
// Compute the length of a lean string
  // ToDo: area_allocator could store the exact size instead of aligned
  const size =  value( lean_header( cell ) + 1 * ONE ) - 2 * size_of_cell;
  let len = size;
  let ii = len - 1;
  // It's the size minus the null bytes at the end
  while( lean_byte_at( cell, ii ) == 0 ){
    len--;
    ii--;
  }
  return len;
}


function lean_strdup_from_c_str( str : TxtC ) : Cell {
// Create a lean copy of a native string
  /**/ const str_len = str.length;
  //c/ auto  str_len = strlen( str );
  // Add one for the null terminator
  const needed_cells = lean_aligned_cell_length( str_len + 1 );
  const cell = lean_allocate_cells( needed_cells );
  // Typescript version uses the mem8 view on the memory buffer
  // ToDo: use a TextEncoder.encodeInto() instead
  /*!c{*/
    // Copy each character
    for( let ii = 0; ii < str_len; ii++ ){
      lean_byte_at_put( cell, ii, str.charCodeAt( ii ) );
    }
    // Add the null terminator
    lean_byte_at_put( cell, str_len, 0 );
  /*}*/
  // C++ version uses fast memcpy(), including the final null terminator
  //c/ memcpy( (char*) ( (int) to_ptr( cell ) ), str, str_len + 1 );
  alloc_de&&mand_eq( lean_strlen( cell ), str_len );
  return cell;
}


function lean_native_string( cell : Cell ) : TxtC {
// Create a native string from a lean string. Shared representations.
  // Typescript version
  /*!c{*/
    // ToDo:: optimize this a lot, using a Javascript TextDecoder
    const len = lean_strlen( cell );
    let str = "";
    for( let ii = 0; ii < len; ii++ ){
      str += String.fromCharCode( lean_byte_at( cell, ii ) );
    }
    return str;
  /*}*/
  // C++ version is much simpler, it's already a native string
  /*c{
    return (char*) to_ptr( cell );
  }*/
}


function lean_streq( cell1 : Cell, cell2 : Cell ) : boolean {
// Compare two lean strings for equality
  // This is faster than using lean_strcmp because it avoids
  // the overhead of the loop when the strings have different lengths
  const len1 = lean_strlen( cell1 );
  const len2 = lean_strlen( cell2 );
  if( len1 != len2 ){
    return false;
  }
  // ToDo: I could avoid checking that last padding null bytes
  let ii = 0;
  for( ii = 0 ; ii < len1 ; ii++ ){
    if( lean_byte_at( cell1, ii ) != lean_byte_at( cell2, ii ) ){
      return false;
    }
  }
  return true;
}


/*c{
bool lean_streq_with_c_str( Cell cell1, TxtC str ){
// Compare a lean string with a native string
  const len1 = lean_strlen( cell1 );
  const len2 = strlen( str );
  if( len1 != len2 ){
    return false;
  }
  return strncmp( (char*) to_ptr( cell1 ), str, len1 ) == 0;
}
}*/


function lean_strcmp( cell1 : Cell, cell2 : Cell ) : Value {
// Compare two lean strings
  // Typescript version
  /*!c{*/
    const len1 = lean_strlen( cell1 );
    const len2 = lean_strlen( cell2 );
    const len = Math.min( len1, len2 );
    for( let ii = 0; ii < len; ii++ ){
      const byte1 = lean_byte_at( cell1, ii );
      const byte2 = lean_byte_at( cell2, ii );
      if( byte1 < byte2 ){
        return -1;
      }else if( byte1 > byte2 ){
        return 1;
      }
    }
    if( len1 < len2 ){
      return -1;
    }else if( len1 > len2 ){
      return 1;
    }
    return 0;
  /*}*/
  // C++ version is much simpler, it's already a native string
  //c/ return strcmp( (char*) to_ptr( cell1 ), (char*) to_ptr( cell2 ) );
}


function lean_strcat( cell1 : Cell, cell2 : Cell ) : Cell {
// Concatenate two lean strings, returns a new string
  // Compute the length of the result
  const len1 = lean_strlen( cell1 );
  const len2 = lean_strlen( cell2 );
  // Add one for the final null terminator
  const len = len1 + len2 + 1;
  const ncells = lean_aligned_cell_length( len );
  // Allocate the needed cells
  const cell = lean_allocate_cells( ncells );
  // C++ version uses fast memcpy(), including the final null terminator
  /*c{
    memcpy(
      (char*) to_ptr( cell ),
      (char*) to_ptr( cell1 ),
      len1
    );
    memcpy(
      (char*) to_ptr( cell ) + len1,
      (char*) to_ptr( cell2 ),
      len2 + 1
    );
  }*/
  // Other versions copy each character
  /*!c{*/
    // Copy the first string
    for( let ii = 0 ; ii < len1; ii++ ){
      lean_byte_at_from( cell, ii, cell1, ii );
    }
    // Copy the second string, including the final null terminator
    for( let ii = 0; ii <= len2; ii++ ){
      lean_byte_at_from( cell, len1 + ii, cell2, ii );
    }
  /*}*/
  alloc_de&&mand_eq( lean_strlen( cell ), len - 1 );
  return cell;
}


function lean_strindex( str1 : Cell, str2 : Cell ) : Value {
// Find the first occurence of str2 in str1
  // ToDo: fast C++ version
  // Compute the length of the strings
  const len1 = lean_strlen( str1 );
  const len2 = lean_strlen( str2 );
  // Loop over the first string
  let ii = 0;
  let jj = 0;
  for( ii = 0 ; ii < len1 ; ii++ ){
    // Check if the first character matches
    if( lean_byte_at( str1, ii ) == lean_byte_at( str2, 0 ) ){
      // Loop over the second string
      for( jj = 1 ; jj < len2; jj++ ){
        // Check if the characters match
        if( lean_byte_at( str1, ii + jj ) != lean_byte_at( str2, jj ) ){
          break;
        }
      }
      // Check if the second string was found
      if( jj == len2 ){
        return ii;
      }
    }
  }
  return -1;
}


function lean_strrindex( target : Cell, pattern : Cell ) : Value {
// Find the last occurence of str2 in str1
  // ToDo: fast C++ version
  let ii = 0;
  let jj = 0;
  let kk = 0;
  const len_target = lean_strlen( target );
  const len_pattern = lean_strlen( pattern );
  for( ii = len_target - 1 ; lean_byte_at( target, ii ) != 0 ; ii-- ){
    jj = ii;
    kk = len_pattern - 1;
    while( lean_byte_at( pattern, kk ) != 0
    && lean_byte_at( target, jj ) == lean_byte_at( pattern, kk )
    ){
      jj--;
      kk--;
    }
    if( kk < 0 ){
      return ii - len_pattern + 1;
    }
  }
  return -1;
}


function lean_substr( str : Cell, start : Value, len : Value ) : Cell {
// Extract a substring from a lean string

  // If past the end, return an empty string
  const str_len = lean_strlen( str );
  if( start >= str_len ){
    return lean_strdup_from_c_str( "" );
  }

  // Truncate the length if needed
  if( start + len > str_len ){
    len = str_len - start;
  }

  // ToDo: if big enough, share the string
  // This requires to detect that cstr points to a substring.
  // It also means that .c_str() must turn the substring into
  // a full string, null terminated, ie stop sharing.
  // This is worth the trouble once lean mode is stable.

  // Allocate the result
  const ncells = lean_aligned_cell_length( len + 1 );
  const cell = lean_allocate_cells( ncells );

  // Copy the substring
  // ToDo: fast C++ version
  let ii = 0;
  for( ii = 0 ; ii < len ; ii++ ){
    lean_byte_at_from( cell, ii, str, start + ii );
  }
  return cell;
}


function lean_string_test() : Index {
// Test the string functions
  const str1 = lean_strdup_from_c_str( "Hello" );
  const str2 = lean_strdup_from_c_str( "World" );
  const str3 = lean_strcat( str1, str2 );
  const str4 = lean_strdup_from_c_str( "HelloWorld" );
  if( lean_strcmp( str3, str4 ) != 0 ){
    FATAL( "lean_strcmp failed" );
    return 0;
  }
  if( lean_strindex( str3, str1 ) != 0 ){
    FATAL( "lean_strindex failed" );
    return 0;
  }
  if( lean_strindex( str3, str2 ) != 5 ){
    FATAL( "lean_strindex failed" );
    return 0;
  }
  const str5 = lean_substr( str3, 0, 5 );
  if( lean_strcmp( str5, str1 ) != 0 ){
    FATAL( "lean_substr failed" );
    return 0;
  }
  lean_free( str1 );
  lean_free( str2 );
  lean_free( str3 );
  lean_free( str4 );
  lean_free( str5 );
  return 1;
}

const lean_string_test_done = lean_string_test();


// Now we get all we need to implement the std library compatible string

// Only in C++ however
/*c{

// #define to_cstr( cell ) ( (char*) to_ptr( cell ) )
# define to_cstr( cell ) ( reinterpret_cast<char*>( to_ptr( cell ) ) )


class LeanString {

  public:

  // Where the C string is stored, null terminated
  char* cstr;

  // Constructor
  LeanString( void ){
    cstr = to_cstr( lean_strdup_from_c_str( "" ) );
  }

  // Constructor from a C string
  LeanString( TxtC str ){
    cstr = to_cstr( lean_strdup_from_c_str( str ) );
  }

  // Constructor from a C string literal
  template< std::size_t N >
  LeanString( const char (&str)[N] ){
    cstr = to_cstr( lean_strdup_from_c_str( str ) );
  }

  // Destructor
  ~LeanString( void ){
    lean_free( to_cell( cstr ) );
  }

  // Copy constructor
  LeanString( const LeanString& str ){
    cstr = to_cstr( lean_strdup_from_c_str( str.cstr ) );
  }

  TxtC c_str( void ) const {
    return cstr;
  }

  char* mut_c_str( void ) const {
    return cstr;
  }

  operator const char*( void ) const {
    return c_str();
  }

  // Assignment operator
  LeanString& operator=( const LeanString& str ){
    lean_free( to_cell( cstr ) );
    cstr = to_cstr( lean_strdup_from_c_str( str.cstr ) );
    return *this;
  }

  // Assignment operator from a C string
  LeanString& operator=( TxtC str ){
    lean_free( to_cell( cstr ) );
    cstr = to_cstr( lean_strdup_from_c_str( str ) );
    return *this;
  }

  // Concatenation operator
  LeanString operator+( const LeanString& str ) const {
    // ToDo: optimize this
    auto str1 = lean_strdup_from_c_str( str.cstr );
    auto str2 = lean_strcat( to_cell( cstr ), str1 );
    auto r = LeanString( to_cstr( str2 ) );
    lean_free( str1 );
    lean_free( str2 );
    return r;
  }

  // Concatenation operator from a C string
  LeanString operator+( TxtC str ) const {
    // ToDo: optimize this
    auto str1 = lean_strdup_from_c_str( str );
    auto str2 = lean_strcat( to_cell( cstr ), str1 );
    auto r = LeanString( to_cstr( str2 ) );
    lean_free( str1 );
    lean_free( str2 );
    return r;
  }

  // Concatenation operator
  LeanString& operator+=( const LeanString& str ){
    auto old_cell = to_cell( cstr );
    cstr = to_cstr( lean_strcat( old_cell, to_cell( str.cstr ) ) );
    lean_free( old_cell );
    return *this;
  }

  // Concatenation operator from a C string
  LeanString& operator+=( TxtC str ){
    auto old_cell = to_cell( cstr );
    auto str1 = lean_strdup_from_c_str( str );
    cstr = to_cstr( lean_strcat( old_cell, str1 ) );
    lean_free( old_cell );
    lean_free( str1 );
    return *this;
  }

  // Concatenation operator from a char
  LeanString& operator+=( char c ){
    // ToDo: optimize this
    auto old_cell = to_cell( cstr );
    char buf[ 2 ] = { c, '\0' };
    auto str1 = lean_strdup_from_c_str( buf );
    cstr = to_cstr( lean_strcat( old_cell, str1 ) );
    lean_free( old_cell );
    lean_free( str1 );
    return *this;
  }

  // Comparison operator
  bool operator==( const LeanString& str ) const {
    return lean_streq( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Comparison operator from a C string
  bool operator==( TxtC str ) const {
    auto r = lean_streq_with_c_str( to_cell( cstr ), str );
    return r;
  }

  // Comparison operator
  bool operator!=( const LeanString& str ) const {
    return !lean_streq( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Comparison operator from a C string
  bool operator!=( TxtC str ) const {
    auto r = !lean_streq_with_c_str( to_cell( cstr ), str );
    return r;
  }

  // Returns the length of the string
  size_t length() const {
    return lean_strlen( to_cell( cstr ) );
  }

  // Return a substring
  LeanString substr( size_t pos, size_t len ) const {
    // ToDo: optimize this
    auto r = LeanString( to_cstr( lean_substr( to_cell( cstr ), pos, len ) ) );
    return r;
  }

  // Return char at position or 0 if out of bounds
  char at( size_t pos ) const {
    if( pos >= length() ) return 0;
    return cstr[ pos ];
  }

  // [] operator
  char operator[]( size_t pos ) const {
    return at( pos );
  }

  // True if the string is empty
  bool empty() const {
    return cstr[ 0 ] == '\0';
  }

  // Find a substring
  int find( const LeanString& str ) const {
    return lean_strindex( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Find a substring, from the end
  int rfind( const LeanString& str ) const {
    return lean_strrindex( to_cell( cstr ), to_cell( str.cstr ) );
  }

}; // ToDO: why do I need this semicolon here?

// Overloaded binary + operator for "xxx" + LeanString
LeanString operator+( TxtC str1, const LeanString& str2 ){
  Text r = str1;
  r += str2;
  return r;
}


// Now that LeanString is defined, some needed overloaded functions are possible

bool mand2( bool b1, const Text& msg ){
  return mand2_c_str( b1, msg.mut_c_str() );
}


int lean_strcmp( const LeanString& str1, TxtC str2 ){
  return strcmp( str1.c_str(), str2 );
}


bool trace( const LeanString& str ){
  trace_c_str( str.mut_c_str() );
  return true;
}


// Now that LeanString is defined, some needed forward declarations are possible
Text  dump( Cell );
Text  short_dump( Cell );
Text  stacks_dump( void );
void  set_text_cell( Cell, ConstText );
Text  cell_to_text( Cell );
Text  tag_to_text( Tag );
Text  type_to_text( Index );
Text  proxy_to_text( Cell );
Text  integer_to_text( Value );
Text  verb_to_text_definition( Tag );
Text  type_to_text( Index );
Text  inox_machine_code_cell_to_text( Cell );
Text  extract_line( TxtC, Index );
}*/

/*
 *  There is some special handling of the empty string.
 */

/**/ const no_text = "";
//c/ static const Text no_text;


/* -----------------------------------------------------------------------------
 *  Helper functions to deal with Typescript and C++ strings in a way that is
 *  compatible with both languages (and with possible future target languages).
 *
 *  tcut(), tbut() and tmid() to extract sub parts of the text.
 *
 *  S(), N(), C(), P() and F() to concatenate text and various types of numbers.
 */

/*
 *  S() - start of text concatenation operations.
 *  Note: in many cases the C++ type inference mechanism is enough to avoid
 *  the S() call but there are still a few cases where it is apparently needed.
 */

/**/ function S(){ return ""; }
//c/ Text     S(){ return TxtD( "" ); }


/*
 *  N( n ) - convert a number to a text.
 *  If number is a cell address, it is converted to a text with the @ prefix.
 */

/**/ function N( n : number ){ return "" + n; }
/*c{
  Text N( int n ){
    char buf[ 32 ];
    if( n >= the_very_first_cell && n <= the_next_free_cell ){
      sprintf_s( buf, sizeof( buf ), "@%d", n );
    }else{
      sprintf_s( buf, sizeof( buf ), "%d", n );
    }
    auto r = Text( buf );
    return r;
  }
}*/


/*
 *  C( c ) - convert a cell address to a text, with the @ prefix.
 *  If the cell is not in the valid range, @!!! is prepended to the number.
 */

function C( c : Cell ) : Text {
  if( c >= the_very_first_cell && c <= the_next_free_cell ){
    return N( c - the_very_first_cell );
  }
  return S()+ "@!!!" + N( c );
}


/*
 *  F( fn ) - convert a function name/pointer to a text.
 */

/**/ function F( fn : Function ){ return fn.name }
// ToDo: C++ should search the symbol table to get the name of the function
//c/ Text _F( const void* fn ){ return N( (int) fn ); }
//c/ #define F( fn ) _F( (const void*) fn )


/*
 *  P( p ) - convert a pointer to a text.
 */

/**/ function P( p : any ){ return N( p ); }
//c/ Text P( const void* p ){ return N( (int) p ); }


/*
 *  tlen( text )
 *    Return the length of the text.
 *    UTF-8 characters are counted as one character / one byte.
 */

/**/ function tlen( s : Text ){ return s.length; }
//c/ int tlen( const Text& s ){ return s.length(); }
//c/ int tlen( TxtC s ){ return strlen( s ); }


/*
 *  tbut( text, n )
 *    Return text minus the first n characters, minus last if n is negative.
 *    I.e. all "but" the first n characters.
 */

/**/ function tbut( s : Text, n : number ){ return s.slice( n ); }

/*c{

Text tbut( const Text& s, int n ){
  if( n >= 0 ){
    if( (unsigned int) n >= s.length() )return no_text;
    return s.substr( n, s.length() );
  }else{
    int start = s.length() + n;
    if( start < 0 )return s;
    return s.substr( start, s.length() );
  }
}

}*/


/*
 *  tcut( text, n )
 *    Return n first characters of text, last characters if n is negative.
 *    I.e. a "cut" of the first n characters off the whole text.
*/

/**/ function tcut( s : Text, n : number ){ return s.slice( 0, n ); }
/*c{
Text tcut( const Text& s, int n ){
  if( n >= 0 ){
    if( (unsigned int) n >= s.length() )return s;
    return s.substr( 0, n );
  }else{
    int end = s.length() + n;
    if( end <= 0 )return "";
    return s.substr( 0, end );
  }
}
}*/


/*
 *  tmid( start, end )
 *     Return characters of text between start (included ) and end (excluded).
 *     If start is negative, it's counted from the end of the text.
 *     If end is negative, it's counted from the end of the text.
 *     I.e. a "mid" part of the whole text, in the middle.
 */

/**/ function tmid( t : Text, start : Index, end : Index ){
/**/   return t.slice( start, end );
/**/ }

/*c{

Text tmid( const Text& t, int start, int end ){
  int len = t.length();
  if( start < 0 ){
    start = len + start;
  }
  if( end < 0 ){
    end = len + end;
  }
  if( end > len ){
    end = len;
  }
  if( start >= end ){
    return "";
  }
  if( start < 0 ){
    start = 0;
  }
  return t.substr( start, end - start );
}
}*/


/*
 *  tlow( text )
 *    Return text in lower case.
 */

/**/ function tlow( s : Text ){ return s.toLowerCase(); }

/*c{
Text tlow( const Text& s ){
  Text r;
  for( unsigned int ii = 0; ii < s.length(); ii++ ){
    // ToDo: very slow
    auto ch = s.at( ii );
    if( ch < 128 ){
      r += (char) tolower( ch );
    }else{
      r += ch;
    }
  }
  return r;
}
}*/


/*
 *  tup( text )
 *    Return text in upper case.
 *
 */

/**/ function tup( s : Text ){ return s.toUpperCase(); }

/*c{
Text tup( const Text& s ){
  Text r;
  for( unsigned int ii = 0; ii < s.length(); ii++ ){
    // ToDo: very slow
    auto ch = s.at( ii );
    if( ch < 128 ){
      r += (char) toupper( ch );
    }else{
      r += ch;
    }
  }
  return r;
}
}*/


/*
 *  teq( text1, text2 ) - teq, text equality.
 *    Return true if two texts are the same text.
 */

/*!c{*/
function teq( s1 : Text, s2 : Text ) : boolean {
  return s1 == s2;
}
/*}*/

// C++ overloaded functions, depending on string representation

/*c{

bool teq( const Text& s1, const Text& s2 ) {
  return s1 == s2;
}


bool teq( const Text& s1, const char* s2 ) {
  return s1 == s2;
}


bool teq( const char* s1, const Text& s2 ) {
  return s2 == s1;
}


bool teq( const Text& s1, char s2 ) {
  if( s1.empty() )return s2 == 0;
  return s1.length() == 1 && s1.c_str()[ 0 ] == s2;
}


bool teq( const char* s1, const char* s2 ) {
  return strcmp( s1, s2 ) == 0;
}


bool teq( char s1, char s2 ) {
  return s1 == s2;
}


bool teq( char s1, const char* s2 ) {
  return s2[ 0 ] == s1 && s2[ 1 ] == 0;
}

}*/


/*
 *  tneq( text1, text2 ) - tneq, text not equal.
 *    Return true if two texts are not the same text.
 *   I.e. the opposite of teq().
 */

/*!c{*/
function tneq( s1 : Text, s2 : Text ) : boolean {
  return s1 != s2;
}
/*}*/

// C++ overloaded functions, depending on string representation
/*c{

bool tneq( const Text& s1, const Text& s2 ) {
  return s1 != s2;
}


bool tneq( const Text& s1, const char* s2 ) {
  return strcmp( s1.c_str(), s2 ) != 0;
}


bool tneq( const char* s1, const Text& s2 ) {
  return s2 != s1;
}


bool tneq( const char* s1, const char* s2 ) {
  return strcmp( s1, s2 ) != 0;
}


bool tneq( const char* s1, char s2 ) {
  return s1[ 0 ] != s2 || s1[ 1 ] != 0;
}


bool tneq( char s1, char s2 ) {
  return s1 != s2;
}


bool tneq( char s1, const char* s2 ) {
  return s2[ 0 ] != s1 || s2[ 1 ] != 0;
}

}*/


/*
 *  tidx() - index of substring in text, -1 if not found
 */

function tidx( s : Text, sub : Text ) : Index {
  /**/ return s.indexOf( sub );
  //c/ return s.find( sub );
}


/*
 *  tidxr() - last index of substring in text, -1 if not found
 */

function tidxr( s : Text, sub : Text ) : Index {
  /**/ return s.lastIndexOf( sub );
  //c/ return s.rfind( sub );
}


/*
 *  Some basic tests of the above functions
 */


/**/function tbad( actual : any, expected : any ) : boolean {
//c/ bool tbad( int actual, int expected ){
  // Return true bad, i.e. not as expected
  if( actual == expected )return false;
  trace( S()
    + "tbad: actual: " + N( actual )
    + " vs expected: " + N( expected )
  );
  debugger;
  return true;
}


/*c{
bool tbad( Text actual, Text expected ){
  if( actual == expected )return false;
  trace( S()
    + "tbad: actual: " + actual
    + " vs expected: " + expected
  );
  debugger;
  return true;
}
}*/


function test_text() : Index {

  // tidx()
  if( tbad( tidx( "abc", "b" ),     1 ) )return 0;
  if( tbad( tidx( "abc", "d" ),    -1 ) )return 0;
  if( tbad( tidx( "abc", "bc" ),    1 ) )return 0;
  if( tbad( tidx( "abc", "ab" ),    0 ) )return 0;
  if( tbad( tidx( "abc", "abc" ),   0 ) )return 0;
  if( tbad( tidx( "abc", "abcd" ), -1 ) )return 0;

  // tidxr()
  if( tbad( tidxr( "abc", "b" ),     1 ) )return 0;
  if( tbad( tidxr( "abc", "d" ),    -1 ) )return 0;
  if( tbad( tidxr( "abc", "bc" ),    1 ) )return 0;
  if( tbad( tidxr( "abc", "ab" ),    0 ) )return 0;
  if( tbad( tidxr( "abc", "abc" ),   0 ) )return 0;
  if( tbad( tidxr( "abc", "abcd" ), -1 ) )return 0;
  if( tbad( tidxr( "abcabc", "bc" ), 4 ) )return 0;

  // tmid()
  if( tbad( tmid( "abc", 0, 3 ), "abc" ) )return 0;
  if( tbad( tmid( "abc", 0, 2 ), "ab"  ) )return 0;
  if( tbad( tmid( "abc", 1, 2 ), "b"   ) )return 0;
  if( tbad( tmid( "abc", 1, 1 ), ""    ) )return 0;
  if( tbad( tmid( "abc", 1, 0 ), ""    ) )return 0;
  if( tbad( tmid( "abc", 0, 0 ), ""    ) )return 0;
  if( tbad( tmid( "abc", 0, 1 ), "a"   ) )return 0;
  if( tbad( tmid( "abc", 0, 4 ), "abc" ) )return 0;
  if( tbad( tmid( "abc", 1, 4 ), "bc"  ) )return 0;
  if( tbad( tmid( "abc", 2, 4 ), "c"   ) )return 0;
  if( tbad( tmid( "abc", 2, 1 ), ""    ) )return 0;
  if( tbad( tmid( "abc", 2, 0 ), ""    ) )return 0;

  // tmid(), with negative indexes
  if( tbad( tmid( "abc", -1, 3 ), "c"   ) )return 0;
  if( tbad( tmid( "abc", -2, 3 ), "bc"  ) )return 0;
  if( tbad( tmid( "abc", -3, 3 ), "abc" ) )return 0;
  if( tbad( tmid( "abc", -4, 3 ), "abc" ) )return 0;
  if( tbad( tmid( "abc", -1, 2 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -2, 2 ), "b"   ) )return 0;
  if( tbad( tmid( "abc", -3, 2 ), "ab"  ) )return 0;
  if( tbad( tmid( "abc", -4, 2 ), "ab"  ) )return 0;
  if( tbad( tmid( "abc", -1, 1 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -2, 1 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -3, 1 ), "a"   ) )return 0;
  if( tbad( tmid( "abc", -4, 1 ), "a"   ) )return 0;
  if( tbad( tmid( "abc", -1, 0 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -2, 0 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -2, 1 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -3, 0 ), ""    ) )return 0;
  if( tbad( tmid( "abc", -4, 0 ), ""    ) )return 0;

  // tcut()
  if( tbad( tcut( "abc",  3 ), "abc" ) )return 0;
  if( tbad( tcut( "abc",  2 ), "ab"  ) )return 0;
  if( tbad( tcut( "abc",  1 ), "a"   ) )return 0;
  if( tbad( tcut( "abc",  0 ), ""    ) )return 0;
  if( tbad( tcut( "abc", -1 ), "ab"  ) )return 0;
  if( tbad( tcut( "abc", -2 ), "a"   ) )return 0;
  if( tbad( tcut( "abc", -3 ), ""    ) )return 0;
  if( tbad( tcut( "abc", -4 ), ""    ) )return 0;

  // tbut()
  if( tbad( tbut( "abc",  3 ), ""    ) )return 0;
  if( tbad( tbut( "abc",  2 ), "c"   ) )return 0;
  if( tbad( tbut( "abc",  1 ), "bc"  ) )return 0;
  if( tbad( tbut( "abc",  0 ), "abc" ) )return 0;
  if( tbad( tbut( "abc", -1 ), "c"   ) )return 0;
  if( tbad( tbut( "abc", -2 ), "bc"  ) )return 0;
  if( tbad( tbut( "abc", -3 ), "abc" ) )return 0;
  if( tbad( tbut( "abc", -4 ), "abc" ) )return 0;
  if( tbad( tbut( "abc", -5 ), "abc" ) )return 0;

  // tlow()
  if( tbad( tlow( "abc" ), "abc" ) )return 0;
  if( tbad( tlow( "ABC" ), "abc" ) )return 0;
  if( tbad( tlow( "aBc" ), "abc" ) )return 0;
  if( tbad( tlow( "AbC" ), "abc" ) )return 0;

  // tup()
  if( tbad( tup( "abc" ), "ABC" ) )return 0;
  if( tbad( tup( "ABC" ), "ABC" ) )return 0;
  if( tbad( tup( "aBc" ), "ABC" ) )return 0;
  if( tbad( tup( "AbC" ), "ABC" ) )return 0;

  return 1;
}

// Hack to invoke test_text() at C++ dynamic initialization time
const test_text_done = test_text();


/* -----------------------------------------------------------------------------
 *  Some more assertion checker, defined now because they use the LeanString
 *  type that is not defined where the other assertions checkers are.
 */


function mand_eq( a : i32, b : i32 ) : boolean {
  // Check that two values are equal
  if( a == b )return true;
  if( is_valid_tag( a ) || is_valid_tag( b ) ){
    if( is_valid_tag( a ) && is_valid_tag( b ) ){
      trace(
        S()+ "bad eq " + tag_to_text( a ) + " / " + tag_to_text( b )
      );
    }else if( is_valid_tag( a ) ){
      trace( S()+ "bad eq " + tag_to_text( a ) + " / " + N( b ) );
    }else{
      trace( S()+ "bad eq " + N( a ) + " / " + tag_to_text( b ) );
    }
  }
  mand2( false, S()+ "bad eq " + N( a ) + " / " + N( b ) );
  return false;
}


function mand_neq( a : i32, b : i32 ) : boolean {
  if( a != b )return true;
  breakpoint();
  mand2( false, S()+ "bad neq " + N( a ) + " / " + N( b ) );
  return false;
}


/* -----------------------------------------------------------------------------
 *  Cell allocator
 */

function init_cells_allocator() : Index {

  // Typescript version, using ArrayBuffers:
  /**/ the_very_first_cell = 0;
  /**/ the_free_cell_limit = mem32.length;

  // C++ version, using calloc() chuncks:
  /*c{
    the_very_first_cell = to_cell( (int) calloc( INOX_HEAP_SIZE, 1 ) );
    if( the_very_first_cell == 0 ){
      FATAL( "Out of memory, first calloc() failed" );
      return 0;
    }
    the_free_cell_limit = the_very_first_cell + to_cell( INOX_HEAP_SIZE ) - 1;
  }*/

  the_next_free_cell = the_very_first_cell;

  // Avoid using the addresses that match a type id
  // It helps for debugging traces, see N() and C()
  /**/ allocate_cells( 16 );

  the_tmp_cell = allocate_cell();
  return 1;
}


function resize_memory(){
  // The heap is full, we need to expand it

  // Typescript version:
  /**/  const new_size = mem32.length + INOX_HEAP_SIZE / 16;
  /**/  const new_mem    = new ArrayBuffer( new_size );
  /**/  const new_mem8   = new Uint8Array(   new_mem );
  /**/  const new_mem32  = new Int32Array(   new_mem );
  /**/  const new_mem32f = new Float32Array( new_mem );
  /**/  // Copy the old memory buffer into the new one
  /**/  // ToDo: use ArrayBuffer.transfert() when it becomes available (03/2023)
  /**/  new_mem32.set( mem32 );
  /**/  // Update the global variables
  /**/  mem    = new_mem;
  /**/  mem8   = new_mem8;
  /**/  mem32  = new_mem32;
  /**/  mem32f = new_mem32f;
  /**/  the_free_cell_limit = mem32.length;

  // C++ version:
  /*c{
    // Add a sentinel cell at the end of the older chunk, see memory_dump()
    // ToDo: maybe I should create a "fake" busy area?
    set_next_cell( the_free_cell_limit, -1 );
    // Allocate a new chunk
    // ToDo: it bugs if new_mem is at a lower address than the old limit
    // Workaround: use a bigger chunk until it's address is higher?
    // Another workaround is to use realloc() and relocate everything...
    void* new_mem = calloc( 1, INOX_HEAP_SIZE / 16 ); // 16 Kb
    if( new_mem == NULL ){
      FATAL( "Out of memory for cells" );
      return;
    }
    if( (int) new_mem < (int) to_ptr( the_free_cell_limit ) ){
      FATAL( "Out of memory, new alloc is too low" );
      return;
    }
    // Set the new limit (including space for sentinel) & the new next free cell
    the_free_cell_limit
    = to_cell( ( (int) new_mem ) + to_cell( INOX_HEAP_SIZE / 16 ) ) - 1;
    the_next_free_cell = to_cell( (int) new_mem );
  }*/
}


function mand_list_cell( c : Cell ) : boolean {
// Check that a cell is a list cell
  mand_eq( name( c ), tag_list );
  return true;
}


function next( c : Cell ) : Cell {
// Assuming cell is a list member, return next cell in list
  // When a cell is unused, the name is changed into "list" and the value
  // is used to store the next cell in some list.
  // ToDo: use a native type instead of this trickery?
  de&&mand_list_cell( c );
  return value( c );
}


function is_last_cell( c : Cell ) : boolean {
  // Assuming cell is a list member, return true if it is the last cell in list
  de&&mand_list_cell( c );
  return next( c ) == 0;
}


function set_next_cell( c : Cell, nxt : Cell ) : void {
  // Turn cell into a list member, set the next cell in list
  init_cell( c, nxt, tag_list );
  mem_de&&mand_eq( next( c ), nxt );
}


function allocate_cells( n : Count ) : Cell {
// Allocate a number of consecutive cells. See also allocate_area()
  if( de && debug_next_allocate != 0 ){
    debug_next_allocate = the_next_free_cell - debug_next_allocate;
    debugger;
    debug_next_allocate = 0;
  }
  // Do we cross the limit?
  while( the_next_free_cell + n * ONE > the_free_cell_limit ){
    // The heap is full, we need to expand it
    resize_memory();
  }
  alloc_de&&mand( the_next_free_cell           < the_free_cell_limit  );
  alloc_de&&mand( the_next_free_cell + n * ONE <= the_free_cell_limit );
  const cell = the_next_free_cell;
  the_next_free_cell += n * ONE;
  return cell;
}


function allocate_cell() : Cell {
  // Allocate a new cell or reuse a free one

  if( de && debug_next_allocate != 0 ){
    debug_next_allocate = the_next_free_cell - debug_next_allocate;
    debugger;
    debug_next_allocate = 0;
  }

  // If the free list is empty, allocate a new cell
  let cell = the_first_free_cell;
  if( cell == 0 ){
    // ToDo: check that the heap does not overflow
    if( the_next_free_cell == the_free_cell_limit ){
      // The heap is full, we need to expand it
      resize_memory();
    }
    // The heap grows upward
    cell = the_next_free_cell;
    the_next_free_cell += ONE;

  // Consume the first cell of the free list
  } else {
    the_first_free_cell = next( cell );
    reset( cell );
  }

  de&&mand_empty_cell( cell  );
  return cell;

}


function compact_free_cells() : void {
// Compact the free list of cells

  // Try to free cells in the free list
  let previous = 0;
  let candidate_cell = the_first_free_cell;
  let limit = 1000;

  // Loop while there are free cells that may be compacted
  while( candidate_cell != 0 ){
    // Never loop forever
    if( --limit == 0 )break;
    // If the candidate cell happens to be the last allocated cell
    if( candidate_cell == the_next_free_cell - ONE ){
      // Free it
      the_next_free_cell -= ONE;
      // Remove it from the free list
      if( previous == 0 ){
        the_first_free_cell = next( candidate_cell );
      } else {
        set_next_cell( previous, next( candidate_cell ) );
      }
      reset( candidate_cell );
      // Restart the loop
      candidate_cell = the_first_free_cell;
      previous = 0;
    }else{
      // The candidate cell is not the last allocated cell
      // Move to the next cell in the free list
      previous = candidate_cell;
      candidate_cell = next( candidate_cell );
    }
  }
}


function free_cell( c : Cell ) : void {
// Free a cell, add it to the free list

  de&&mand_empty_cell( c );

  // Special case when free is about the last allocated cell.
  if( c == the_next_free_cell - ONE ){
    // It happens with tempory cells that are needed sometimes.
    // ToDo: get rid of that special case where possible.
    the_next_free_cell = c;
    return;
  }

  // Else, add cell to the linked list of free cells
  set_next_cell( c, the_first_free_cell );
  the_first_free_cell = c;

}


function free_cells( c : Cell, n : Count ) : void {
// Free a number of consecutive cells

  // If last allocated cells, restore the next free cell
  if( c + n * ONE == the_next_free_cell ){
    // This works well for fast LIFO style allocations
    the_next_free_cell = c;
    compact_free_cells();
    return;
  }

  // ToDo: If big enough, it is better to add it to the dynamic pool.
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    free_cell( c + ii * ONE );
  }

}


function mand_empty_cell( c : Cell ) : boolean {
// Check that a cell is empty, 0, 0, 0
  mand_eq( name(  c ), 0 );
  mand_eq( value( c ), 0 );
  mand_eq( type(  c ), 0 );
  return true;
}


// Not on metal
/*!c{*/

function set( c : Cell, t : Type, n : Name, v : Value ) : void {
  de&&mand( is_valid_tag( n ) );
  init_cell( c, v, pack( t, n ) );
  if( mem_de ){
    de&&mand_eq( type(  c ), t );
    de&&mand_eq( name(  c ), n );
    de&&mand_eq( value( c ), v );
  }
}

function set_tos( t : Type, n : Name, v : Value ) : void {
  set( TOS, t, n, v );
}

/*}{

#define set( c, t, n, v )  init_cell( c, v, pack( t, n ) )
#define set_tos( t, n, v ) set( TOS, t, n, v )

}*/


function copy_cell( source : Cell, destination : Cell ){
// Copy the content of a cell, handling references.
  clear( destination );
  init_copy_cell( destination, source );
  if( mem_de ){
    de&&mand_eq( type(  destination ), type(  source ) );
    de&&mand_eq( name(  destination ), name(  source ) );
    de&&mand_eq( value( destination ), value( source ) );
  }
  // If the source was a reference, increment the reference counter
  if( needs_clear( source ) ){
    // This would not be necessary if there were a classical GC.
    // However, I may implement some destructor logic when an object
    // goes out of scope and it sometimes make sense to have that logic
    // excuted immediately instead of later on as would happen with a
    // classical GC. I could also have the best of both world depending
    // on some flag set inside the referenced object.
    // ToDo: make sure copy cell is called when a destructor could be
    // executed without corrupting anything. Alternatively the queue of
    // destructors could be processed by return.
    increment_object_ref_count( value( source ) );
  }
}


function move_cell( source : Cell, destination : Cell ){
// Move the content of a cell, taking care of clearing the destination first.
  clear( destination );
  init_copy_cell( destination, source );
  reset( source );
}


function move_cells( source : Cell, target : Cell, length : Length ){
  let ii;
  for( ii = 0 ; ii < length ; ii++ ){
    move_cell( source + ii * ONE, target + ii * ONE );
  }
}


function raw_move_cell( source : Cell, destination : Cell ){
// Move the content of a cell. Assume destination is empty.
  de&&mand_empty_cell( destination );
  init_copy_cell( destination, source );
  reset( source );
}


function raw_copy_cell( source : Cell, destination : Cell ){
// Copy the content of a cell. Assume destination is empty.
  de&&mand_empty_cell( destination );
  init_copy_cell( destination, source );
}


function reset_cell_value( c : Cell ){
  de&&mand( ! needs_clear( c ) );
  reset_value( c );
}


function clear( c : Cell ){
  // If reference, decrement reference counter and free if needed

  if( ! needs_clear( c ) ){
    if( de ){
      if( type(  c ) == type_tag
      &&  value( c ) == c
      ){
        FATAL( S()+ "clear_cell() on " + dump( c ) );
        return;
      }
    }
    reset( c );
    return;
  }

  // Cell is either a reference or a proxy
  de&&mand( needs_clear( c ) );

  const reference = value( c );
  const typ       = type( c );

  reset( c );

  // Both references and proxies have a reference counter
  if( !is_last_reference_to_area( reference ) ){
    decrement_object_ref_count( reference );
    return;
  }

  // Last reference reached, need to free the area

  // If object, first clear all it's attributes
  if( typ == type_reference ){
    // ToDo: refactor this code with free_object()
    let ptr = reference;
    // Add a level of indirection if object is extensible
    if( type( c ) == type_reference ){
      ptr = get_reference( ptr );
      reset( reference );
      free_area( reference );
    }
    // ToDo: avoid recursion?
    const length = object_length( ptr );
    let ii;
    for( ii = 0 ; ii < length ; ii++ ){
      clear( ptr + ii * ONE );
    }
    free_area( ptr );

  // If text, free the text
  }else if( typ == type_text ){
    free_text( reference );

  // Else it is a proxy, free the proxy
  }else{
    de&&mand_eq( typ, type_proxy );
    free_proxy( reference );
  }
}


/* ---------------------------------------------------------------------------
 *  The symbol table
 *
 *  The symbol table is made of two arrays. One is an array of tag cells.
 *  The other is an array of strings. The index of a symbol in the array
 *  of tag cells is the same as the index of the symbol's string in the
 *  array of strings.
 *
 *  A symbol can be the name of a primitive and/or the name of a user defined
 *  verb. Hence there are two additional arrays, one for primitives and one for
 *  definitions. The index of a symbol in the array of primitives is the same
 *  as the index of the symbol's string in the array of strings. Idem for
 *  definitions.
 *
 *  As a result, there are four arrays for each symbol:
 *    - the tag cell,   a 28 bits address
 *    - the string,     a Text in C++, a string in typescript
 *    - the primitive,  a void (fn)( void ) in C++, a function in typescript
 *    - the definition, a 28 bits address of the first cell of the definition
 *
 *  This makes a total of 4 x 32 bits words per symbol if compiled for 32 bits
 *  and 2 x 32 bits + 2 x 64 bits words per symbol if compiled for 64 bits. ie
 *  16 bytes per symbol if compiled for 32 bits and 24 bytes per symbol if
 *  compiled for 64 bits. In a addition to that there is the space for the
 *  strings themselves plus the overhead of malloc() about that. That's for
 *  C++, the Typescript version is a bit different.
 *
 *  ToDo: this can be optimised a lot. For example the definition can be stored
 *  in the tag cell. The string could also be stored there if such strings where
 *  stored in cells instead of in malloced memory. The primitive could also be
 *  stored in the tag cell when compiling for 32 bits, in the name field of the
 *  tag cell. Additionaly some more memory could be saved by not defining a verb
 *  for each primitive contrary to what is done now.
 */

/*
 *  The global array of all symbol cells. Allocated using allocate_cells()
 */

// let all_symbol_cells = 0;  // Actually declared sooner

// How many symbols are there already?
// let all_symbol_cells_length = 0; // Actually declared sooner

// How many symbols can be stored in the array, total?
let all_symbol_cells_capacity = 0;


// The global array of all symbol texts, an array of strings
// In typescript, those are strings, in C++, it's LearnString objects
/**/ let all_symbol_texts : Array< string >;
//c/ Text* all_symbol_texts = 0;

// The associated array of definitions, if any
/**/ let    all_definitions : Array< Cell >;
//c/ Cell*  all_definitions = (Cell*) 0;

// It becomes a stack object during the bootstrap
let all_definitions_stack = 0;

// The associated array of primitives, if any
/**/ let all_primitives : Array< Primitive >;
//c/ Primitive* all_primitives = (Primitive*) 0;

// It becomes a stack object during the bootstrap
let all_primitives_stack = 0;

// Typescript grows arrays automatically, C++ does not
// ToDo: get rid of this once upgrade_symbols() works
//c/ Length all_primitives_capacity  = 0;
//c/ Length all_definitions_capacity = 0;

//c/ Tag tag( TxtC );


/*
 *  Init all of that
 */


function init_symbols() : Index {
// Initialize the global arrays of all symbols

  // See tables below, from "void" to "stack", 21 symbols
  all_symbol_cells_length = 21;

  // This 512 should be configurable?
  // ToDo: test with a smaller value
  all_symbol_cells_capacity    = 512;
  //c/ all_primitives_capacity  = 512;
  //c/ all_definitions_capacity = 512;

  // ToDo: turn this into a normal stack object asap
  // This becomes possible later on, when the area allocator is ready
  all_symbol_cells
  = allocate_cells( all_symbol_cells_capacity );

  // Such cells are special, kind of tag singleton cells
  let ii;
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    set(
      all_symbol_cells + ii * ONE,
      type_tag,
      ii, // I could store a verb definition address here
      ii  // I could store a Primitive function address here in C++
    );
  }

  /*!c{*/
    // ToDo: I should use a stack for that
    all_symbol_texts = [
      "void",       // 0 - the 16 first symbols must match the type ids
      "boolean",    // 1
      "tag",        // 2
      "integer",    // 3
      "verb",       // 4
      "float",      // 5
      "reference",  // 6
      "proxy",      // 7
      "string",     // 8
      "flow",       // 9
      "list",       // 10
      "invalid",    // 11 - room for future types
      "invalid2",   // 12
      "invalid3",   // 13
      "invalid4",   // 14
      "invalid5",   // 15
      "_dynrc",     // 16 - dynamic area allocator related
      "_dynxt",     // 17
      "_dynsz",     // 18
      "true",       // 19 - misc
      "stack",      // 20
    ];
    // ToDo: I should use a stack for that too
    all_primitives  = [];
    all_definitions = [];
  /*}{
    // ToDo: Area needs to be clear, see calloc() maybe?
    // Alternatively I could allocate within the symbol table or in a dyn area
    //all_symbol_texts
    //= (char**) calloc( all_symbol_cells_capacity, sizeof( char* ) );
    all_symbol_texts = new Text[ all_symbol_cells_capacity ];
    all_symbol_texts[  0 ] = "void";
    all_symbol_texts[  1 ] = "boolean";
    all_symbol_texts[  2 ] = "tag";
    all_symbol_texts[  3 ] = "integer";
    all_symbol_texts[  4 ] = "reference";
    all_symbol_texts[  5 ] = "proxy";
    all_symbol_texts[  6 ] = "string";
    all_symbol_texts[  7 ] = "verb";
    all_symbol_texts[  8 ] = "flow";
    all_symbol_texts[  9 ] = "list";
    all_symbol_texts[ 10 ] = "invalid";
    all_symbol_texts[ 11 ] = "invalid1";
    all_symbol_texts[ 12 ] = "invalid2";
    all_symbol_texts[ 13 ] = "invalid3";
    all_symbol_texts[ 14 ] = "invalid4";
    all_symbol_texts[ 15 ] = "invalid5";
    all_symbol_texts[ 16 ] = "_dynrc";
    all_symbol_texts[ 17 ] = "_dynxt";
    all_symbol_texts[ 18 ] = "_dynsz";
    all_symbol_texts[ 19 ] = "true";
    all_symbol_texts[ 20 ] = "stack";
    all_primitives = (Primitive*) calloc(
      all_primitives_capacity,
      sizeof( Primitive )
    );
    all_definitions = (Cell*) calloc(
      all_definitions_capacity,
      sizeof( Cell )
    );
  }*/

  tag_list = tag( "list" );
  return 1;
}


function upgrade_symbols(){
// Upgrade the global arrays of all symbols into real stack objects

  // First the tag to text table
  const new_symbols = stack_preallocate( all_symbol_cells_length );
  let ii;
  let symbol_tag = 0;
  let auto_symbol_text = S();
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    symbol_tag = name( all_symbol_cells + ii * ONE );
    auto_symbol_text = tag_to_text( symbol_tag );
    set_text_cell( the_tmp_cell, auto_symbol_text );
    set_name( the_tmp_cell, symbol_tag );
    stack_push( new_symbols, the_tmp_cell );
  }

  // Then the tag to definition table
  const new_definitions = stack_preallocate( all_symbol_cells_length );
  let symbol_definition = 0;
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    symbol_tag = name( all_symbol_cells + ii * ONE );
    symbol_definition = definition( symbol_tag );
    set( the_tmp_cell, type_verb, symbol_tag, symbol_definition );
    stack_push( new_definitions, the_tmp_cell );
  }

  // Then the tag to primitive table
  const new_primitives = stack_preallocate( all_symbol_cells_length );
  let auto_symbol_primitive = primitive_noop;
  let primitive_proxy = 0;
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    symbol_tag = name( all_symbol_cells + ii * ONE );
    auto_symbol_primitive = get_primitive( symbol_tag );
    primitive_proxy = make_proxy( auto_symbol_primitive );
    set( the_tmp_cell, type_proxy, symbol_tag, primitive_proxy );
    stack_push( new_primitives, the_tmp_cell );
  }

  // Clear the old global arrays
  for( ii = 0 ; ii < all_symbol_cells_capacity ; ii++ ){
    clear( all_symbol_cells + ii * ONE );
  }
  free_cells( all_symbol_cells, all_symbol_cells_capacity );
  // C++ version needs to free the other arrays too
  /*c{
    delete all_symbol_texts;
    delete all_primitives;
    delete all_definitions;
  }*/

  // Now we can replace the global arrays with the new stacks
  all_symbol_cells = new_symbols;
  all_definitions_stack = new_definitions;
  all_primitives_stack  = new_primitives;

  // From now one, the symbols are handled as normal objects


}


// Hack to force calling init_symbols() during C++ "dynamic initialization"
// See https://en.cppreference.com/w/cpp/language/initialization
let init_symbol_done = init_symbols();


const tag_void      = tag( "void" );
const tag_boolean   = tag( "boolean" );
const tag_tag       = tag( "tag" );
const tag_integer   = tag( "integer" );
const tag_verb      = tag( "verb" );
const tag_float     = tag( "float" );
const tag_reference = tag( "reference" );
const tag_proxy     = tag( "proxy" );
const tag_text      = tag( "text" );
const tag_flow      = tag( "flow" );
const tag_invalid   = tag( "invalid" );
const tag_true      = tag( "true" );
const tag_dynrc     = tag( "_dynrc" );
const tag_dynxt     = tag( "_dynxt" );
const tag_dynsz     = tag( "_dynsz" );
const tag_stack     = tag( "stack" );


function tag_to_text( t : Tag ) : Text {
// Return the string value of a tag
  de&&mand( is_valid_tag( t ) );
  if( ! is_valid_tag( t ) ){
    return S()+ "invalid-tag-" + C( t );
  }
  return all_symbol_texts[ t ];
}


function symbol_to_text( c : Cell ) : Text {
// Return the string value of a cell
  de&&mand_eq( type( c ), type_tag );
  de&&mand_eq( name( c ), value( c ) );
  return all_symbol_texts[ value( c ) ];
}


function symbol_lookup( name : Text ) : Index {
// Return the entry number of a symbol, or 0 if not found
  // Starting from the end
  let ii = all_symbol_cells_length;
  while( --ii ){
    if( teq( symbol_to_text( all_symbol_cells + ii * ONE ), name ) ){
      return ii;
    }
  }
  return 0;
  // ToDo: speed this up with a hash table
}


function register_symbol( name : Text ) : Index {
// Register a symbol and return its entry number

  const index = symbol_lookup( name );

  // Unless it is already registered
  if( index != 0 || teq( name, "void" ) ){
    return index;
  }

  // Allocate a bigger array if needed, twice the size
  if( all_symbol_cells_length == all_symbol_cells_capacity ){

    const new_capacity = all_symbol_cells_capacity * 2;
    const new_cells = allocate_cells( new_capacity );
    move_cells(
      all_symbol_cells,
      new_cells,
      all_symbol_cells_capacity
    );
    free_cells( all_symbol_cells, all_symbol_cells_capacity );
    all_symbol_cells          = new_cells;
    all_symbol_cells_capacity = new_capacity;

    // There is a text representation for each symbol
    /**/ const new_texts = new Array< string >( new_capacity );
    // ToDo: TxtC?
    //c/ Text* new_texts = new Text[ new_capacity ];
    // Move the texts from the old to the new array
    let ii;
    for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
      new_texts[ ii ] = all_symbol_texts[ ii ];
      // Clear the old text
      /**/ all_symbol_texts[ ii ] = "";
      //c/ all_symbol_texts[ ii ] = no_text;
    }
    //c/ delete all_symbol_texts;
    all_symbol_texts = new_texts;

    // Space for the potential primitives or definitions is allocated later
  }

  // Add the name to the arrays, as a tag and as a string
  /**/ all_symbol_texts[ all_symbol_cells_length ] = name;
  //c/ all_symbol_texts[ all_symbol_cells_length ] = _strdup( name.c_str() );
  set(
    all_symbol_cells + all_symbol_cells_length * ONE,
    type_tag,
    all_symbol_cells_length,
    all_symbol_cells_length
  );

  // Return the entry number, and move id to next id
  return all_symbol_cells_length++;

}


function register_primitive( t : Tag, f : Primitive ){
// Register a primitive function

  de&&mand( t < all_symbol_cells_length );

  // Allocate more capacity if needed
  /*c{
    if( t >= all_primitives_capacity ){
      int new_capacity = t + 16;
      Primitive* new_primitives
      = (Primitive*) calloc( new_capacity, sizeof( Primitive ) );
      memcpy(
        new_primitives,
        all_primitives,
        all_primitives_capacity * sizeof( Primitive )
      );
      free( all_primitives );
      all_primitives          = new_primitives;
      all_primitives_capacity = new_capacity;
    }
  }*/

  // Register the primitive
  all_primitives[ t ] = f;

}


function register_definition( t : Tag, c : Cell ){
// Register a definition

  de&&mand( t < all_symbol_cells_length );

  // Allocate more capacity if needed
  /*c{
    if( t >= all_definitions_capacity ){
      int new_capacity = t + 64;
      Cell* new_definitions
      = (Cell*) calloc( new_capacity, sizeof( Cell ) );
      memcpy(
        new_definitions,
        all_definitions,
        all_definitions_capacity * sizeof( Cell )
      );
      free( all_definitions );
      all_definitions          = new_definitions;
      all_definitions_capacity = new_capacity;
    }
  }*/

  // Register the definition
  all_definitions[ t ] = c;

}


// ToDo: is this usefull?
/**/ function no_operation()       : void { /* Does nothing */ }
//c/ void     no_operation( void )        {                    }


function  get_primitive( t : Tag ) : Primitive {
// Return the primitive function for a tag, default is no_operation
  de&&mand( t < all_symbol_cells_length );
  /*!c{*/
    return all_primitives[ t ] || no_operation;
  /*}{
    if( t >= all_primitives_capacity ){
      return no_operation;
    }
    Primitive p = all_primitives[ t ];
    if( p == (Primitive) 0 ){
      return no_operation;
    }else{
      return p;
    }
  }*/
}


function get_definition( t : Tag ) : Cell {
// Return the definition for a tag, or 0 if there is none
  de&&mand( t < all_symbol_cells_length );
  /*c{
    if( t >= all_definitions_capacity ){
      return 0;
    }
  }*/
  const d = all_definitions[ t ];
  // de&&mand( d ? true : false );
  return d;
}


function definition_exists( t : Tag ) : boolean {
// Return true if there is a verb definition for the specified tag
  de&&mand( t < all_symbol_cells_length );
  /*c{
    if( t >= all_definitions_capacity ){
      return false;
    }
  }*/
  const d = all_definitions[ t ];
  return d ? true : false;
}


/* ---------------------------------------------------------------------------
 *  Stacks
 *
 *  This is an all purpose data structure that can be used to store an array
 *  of addresses of cells with a string name attached to each entry.
 *  The structure is identical to the one of regular objects and the
 *  name of the first cell (whose value is the number of attributes) is
 *  set to "stack", that's the class name of the object.
 *
 *  The implementation of names varies depending on the target.
 *  In Javascript, there is a shadow array of string values.
 *  In C++, there is a shadow array of pointers to LeanString objects.
 */

function stack_allocate( l : Length ) : Cell {
// Allocate a stack of length l
  // First cell holds the length of the stack and it's class name
  const a = allocate_area( ( l + 1 ) * size_of_cell );
  // If stack is extensible, ie has an initial length of 0
  if( l == 0 ){
    // Then first cell is a reference to some other stack that may change
    set( a, type_reference, tag_stack, stack_allocate( 1 ) ); // one cell
  // If stack isn't extensible, then first cell is the length of the stack
  }else{
    set( a, type_integer, tag_stack, 0 );
    de&&mand_eq( stack_length( a ), 0 );
  }
  de&&mand_eq( stack_length( a ), 0 );
  // ToDo: should return a + ONE maybe, ie skip the header first cell?
  return a;
}


function stack_preallocate( l : Length ) : Cell {
// Allocate an extensible stack with an initial capacity
  const a = allocate_area( 1 * size_of_cell );
  set( a, type_reference, tag_stack, stack_allocate( l ) );
  de&&mand_eq( stack_length( a ), 0 );
  return a;
}


function stack_clear( s : Cell ){
// Empty the entire stack, don't deallocate it however
  let ptr;
  let len;
  let ii;
  // Dereference if stack is extended
  if( stack_is_extended( s ) ){
    ptr = value( s );
  }else{
    ptr = s;
  }
  // First cell is the length of the stack
  de&&mand_cell_type( ptr, type_integer );
  len = value( ptr );
  for( ii = 0 ; ii < len ; ii++ ){
    clear( ptr + ( ii + 1 ) * ONE );
    // ToDo: optimize with some clears() function
  };
  // Set length to 0
  de&&mand_cell_type( ptr, type_integer );
  set_value( ptr, 0 );
  de&&mand_eq( stack_length( s ), 0 );
}


function stack_free( s : Cell ) : void {
// Free a stack
  // Clear all the cells in the stack
  stack_clear( s );
  let ptr;
  // Dereference if stack is extended
  if( stack_is_extended( s ) ){
    ptr = value( s );
    // Check that length is 0
    de&&mand_cell_type( ptr, type_integer );
    de&&mand_eq( value( ptr ), 0 );
    reset( ptr );
    free_area( ptr );
  }else{
    de&&mand_cell_type( s, type_integer );
    de&&mand_eq( value( s ), 0 );
  }
  reset( s );
  free_area( s );
}


function stack_capacity( s : Cell ) : Length {
// Return the capacity of a stack
  // The capacity does not include the first cell that holds the length itself
  if( stack_is_extended( s ) ){
    return area_capacity( value( s ) ) - 1;
  }else{
    return area_capacity( s ) - 1;
  }
}


function stack_length( s : Cell ) : Length {
// Return the length of a stack, ie the number of attributes
  // This does not include the first cell that holds the length itself
  let l;
  if( stack_is_extended( s ) ){
    de&&mand_cell_type( value( s ), type_integer );
    l = value( value( s ) );
  }else{
    de&&mand_cell_type( s, type_integer );
    l = value( s );
  }
  de&&mand( l >= 0 );
  return l;
}


function stack_is_empty( s : Cell ) : boolean {
// Return true if the stack is empty
  return stack_length( s ) == 0;
}


function stack_is_not_empty( s : Cell ) : boolean {
// Return true if the stack is not empty
  return stack_length( s ) != 0;
}


function stack_set_length( s : Cell, l : Length ){
// Set the length of a stack
  // ToDo: what about overflow?
  if( stack_is_extended( s ) ){
    set_value( value( s ), l );
  }else{
    set_value( s, l );
  }
}


function stack_push( s : Cell, c : Cell ){
// Push a cell on a stack, the source cell gets cleared
  const l = stack_length( s );
  stack_put( s, l, c );
  de&&mand_eq( stack_length( s ), l + 1 );
}


function stack_pushes( s : Cell, c : Cell, l : Length ){
// Push an array of cells on a stack, the source cells get cleared
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    stack_push( s, c + ii * ONE );
  }
}


function stack_push_copy( s : Cell, c : Cell ){
// Push a cell on a stack, the source cell is not cleared
  const l = stack_length( s );
  stack_put_copy( s, l, c );
  de&&mand_eq( stack_length( s ), l + 1 );
}


function stack_push_copies( s : Cell, c : Cell, l : Length ){
// Push an array of cells on a stack, the source cells are not cleared
  // ToDo: optimize this
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    stack_push_copy( s, c + ii * ONE );
  }
}


function stack_pop( s : Cell ) : Cell {
// Pop a cell from a stack, just returning it's address
  const i = stack_length( s ) - 1;
  if( check_de && i < 0 ){
    FATAL( "stack_pop: stack is empty" );
  }
  const c = stack_at( s, i );
  stack_set_length( s, i );
  return c;
}


function stack_pop_nice( s : Cell ) : Cell {
// Pop a cell from a stack, just returning it's address, 0 if empty
  const i = stack_length( s ) - 1;
  if( check_de && i < 0 ){
    return 0;
  }
  const c = stack_at( s, i );
  stack_set_length( s, i );
  return c;
}


function stack_peek( s : Cell ) : Cell {
// Peek at the top of a stack, ie the last cell
  let ptr;
  if( stack_is_extended( s ) ){
    ptr = value( s );
  }else{
    ptr = s;
  }
  // base + length works because cell 0 is the length
  return ptr + value( ptr ) * ONE;
}


function stack_dup( s : Cell ) : Cell {
// Duplicate the top of a stack
  const c = stack_peek( s );
  stack_push_copy( s, c );
  return c;
}


function stack_at( s : Cell, i : Index ) : Cell {
// Get the i-th cell from a stack
  let addr;
  // ToDo: handle negative indices?
  // Must be length 1 to hold item 0, hence the + 1
  stack_extend( s, i + 1 );
  if( stack_is_extended( s ) ){
    addr = value( s ) + ( i + 1 ) * ONE;
  }else{
    addr = s + ( i + 1 ) * ONE;
  }
  return addr;
}


function stack_put( s : Cell, i : Index, c : Cell ){
// Set the i-th cell from a stack, the source cell gets cleared
  move_cell( c, stack_at( s, i ) );
}


function stack_put_copy( s : Cell, i : Index, c : Cell ){
// Set the i-th cell from a stack, the source cell is not cleared
  copy_cell( c, stack_at( s, i ) );
}


function stack_dump( s : Cell ) : Text {
// Dump a stack
  // "[ ]" is the empty stack
  const l = stack_length( s );
  let auto_r = S();
  // ToDo: a JSON style format, TLV probably
  auto_r += "[ ";
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    auto_r += dump( stack_at( s, ii ) ) + " ";
  }
  auto_r += "]";
  return auto_r;
}


function stack_split_dump( s : Cell, nth : Index ) : Text {
// Dump a stack, with a newline every nth item
  // "[ ]" is the empty stack
  const l = stack_length( s );
  let auto_r = S();
  // ToDo: a JSON style format, TLV probably
  auto_r += "[ ";
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    if( ii % nth == 0 ){
      auto_r += "\n";
    }
    auto_r += short_dump( stack_at( s, ii ) ) + " ";
  }
  auto_r += "]";
  return auto_r;
}


function stack_lookup_by_name( s : Cell, n : ConstText ) : Cell {
// Lookup a cell in a stack by name
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const c = stack_at( s, ii - 1 );
    if( teq( n, tag_to_text( name( c ) ) ) ){
      return c;
    }
  }
  // If the attribute is not found, void is returned
  return 0;
}


function stack_lookup_by_tag( s : Cell, tag : Tag ) : Cell {
// Lookup a cell in a stack by tag
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const c = stack_at( s, ii - 1 );
    if( tag == name( c ) ){
      return c;
    }
  }
  // If the attribute is not found, void is returned
  return 0;
}


function stack_update_by_name( s : Cell, n : ConstText ){
// Update a cell using the tos cell, by name.
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const c = stack_at( s, ii - 1 );
    if( teq( n, tag_to_text( name( c ) ) ) ){
      stack_put( s, ii - 1, stack_peek( s ) );
      stack_pop( s );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_name, attribute not found,"
    + n
  );
}


function stack_update_by_value( s : Cell, c : Cell ){
// Update a cell using the tos cell, by value
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const a = stack_at( s, ii - 1 );
    if( a == c ){
      stack_put( s, ii - 1, stack_peek( s ) );
      stack_pop( s );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_value, attribute not found,"
    + C( c )
  );
}


function stack_update_by_tag( s : Cell, tag : Tag ){
// Update a cell using the tos cell, by tag
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const c = stack_at( s, ii - 1 );
    if( tag == name( c ) ){
      stack_put( s, ii - 1, stack_peek( s ) );
      stack_pop( s );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_tag, attribute not found, "
    + tag_to_text( tag )
  );
}


function stack_contains_cell( s : Cell, c : Cell ) : boolean {
// Check if a stack contains a cell
  const l = stack_length( s );
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    const a = stack_at( s, ii );
    if( a == c ){
      return true;
    }
  }
  return false;
}


function stack_contains_name( s : Cell, n : Text ) : boolean {
// Check if a stack contains a cell by name
  const l = stack_length( s );
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    const c = stack_at( s, ii );
    if( teq( n, tag_to_text( name( c ) ) ) ){
      return true;
    }
  }
  return false;
}


function stack_contains_tag( s : Cell, tag : Tag ) : boolean {
// Check if a stack contains a cell by tag
  const l = stack_length( s );
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    const c = stack_at( s, ii );
    if( tag == name( c ) ){
      return true;
    }
  }
  return false;
}


function stack_resize( s : Cell, l : Length ) : Cell {
// Return a copy of a stack with a new capacity, clear the old stack
  const new_stack = stack_allocate( l );
  let max = stack_length( s );
  if( max > l ){
    max = l;
  }
  let ii;
  for( ii = 0 ; ii < max ; ii++ ){
    move_cell( stack_at( s, ii ), stack_at( new_stack, ii ) );
  }
  stack_free( s );
  stack_set_length( new_stack, max );
  return new_stack;
}


function stack_rebase( s : Cell ) : Cell {
// Return a fixed size copy of a stack, clear the old stack
  return stack_resize( s, stack_length( s ) );
}


function stack_is_extended( s : Cell ) : boolean {
// Check if a stack is extended, ie extensible
  return type( s ) == type_reference;
}


function stack_extend( s : Cell, l : Length ){
// Extend a stack with a new capacity if needed, clear the old stack
  if( l <= stack_capacity( s ) ){
    if( l > stack_length( s ) ){
      stack_set_length( s, l );
    }
    return;
  }
  if( ! stack_is_extended( s ) ){
    FATAL( "Can't extend a non extensible stack" );
  }
  const capacity = stack_capacity( s );
  let new_capacity = capacity;
  while( new_capacity < l ){
    new_capacity = new_capacity * 2;
  }
  const old_stack = value( s );
  const new_stack = stack_resize( old_stack, new_capacity );
  stack_free( old_stack );
  set_value( s, new_stack );
  de&&mand( stack_is_extended( s) );
  if( l > stack_length( s ) ){
    stack_set_length( s, l );
  }
}


/* ---------------------------------------------------------------------------
 *  Boolean. Type 1
 */

/**/  const   boolean_false = 0;
//c/ #define boolean_false   0

/**/  const boolean_true    = 1;
//c/ #define boolean_true    1


function set_boolean_cell( c : Cell, v : Value ){
  de&&mand( v == boolean_false || v == boolean_true );
  set( c, type_boolean, tag_boolean, v );
}


/* ---------------------------------------------------------------------------
 *  Tag, type 2
 *
 *  Tags have an id, it is an address. Whenever the value of a tag
 *  is required as a number, that id is used. Whenever it is the text
 *  representation that is required, it's the name of the tag that
 *  is used.
 *
 *  Special tag /void is a falsy value. It's id is 0.
 *  ToDo: maybe only boolean false is false and all other values are truthy?
 *
 *  For each tag there exists a singleton cell whose address is the id
 *  of the tag. Other cells can then reference that singleton cell so
 *  that two tag cells with the same value are considered equal.
 *
 *  Such cells are never freed.
 */

// the dictionary of tag ids <-> tag cells
// ToDo: should be a regular object

function tag( tag : TxtC ) : Tag {
// Get the singleton cell for a tag, make it on fly if needed
  return register_symbol( tag );
}


function tag_exists( n : TxtC ) : boolean {
// Return true if the tag singleton cell with the given name exists
  return is_valid_tag( symbol_lookup( n ) );
}


function is_valid_tag( id : Tag ) : boolean {
// True if tag was internalized
  // <= vs < because register_symbol() calls this function before incrementing
  return id >= 0 && id <= all_symbol_cells_length;
}


function set_tag_cell( c : Cell, n : Tag ){
  set( c, type_tag, n, n );
}


function set_verb_cell( c : Cell, n : Tag ){
  set( c, type_verb, n, n );
}


/**/ const   the_void_cell = 0; // tag_singleton_cell_by_name( "void" );
//c/ #define the_void_cell   0


/* -----------------------------------------------------------------------
 *  Integer, type 3, 32 bits
 *  ToDo: Double integers, 64 bits.
 *  ToDo: type_f64, type_bigint
 */

function set_integer_cell( c : Cell, v : Value ){
  set( c, type_integer, tag_integer, v );
}


function is_an_integer_cell( c : Cell ) : boolean {
  return type( c ) == type_integer;
}


function cell_integer( c : Cell ) : Value {
  de&&mand_eq( type( c ), type_integer );
  return value( c );
}


/* -----------------------------------------------------------------------
 *  Float, type 4, 32 bits
 *  ToDo: Double integers, 64 bits.
 *  ToDo: type_f64, type_bigint, type_f32
 */

function set_float_cell( c : Cell, v : Float ){
  /**/ set( c, type_float, tag_float, v );
  // For TypeScript, use mem32f
  //a/ set( c, type_float, tag_float, 0 );
  //a/ mem32f[ ( c << 1 ) ] = v;
  //c/ set( c, type_float, tag_float, 0 );
  //c/ *( ( Float * ) ( c << 4 ) ) = v;
}


function is_a_float_cell( c : Cell ) : boolean {
  return type( c ) == type_float;
}


function cell_float( c : Cell ) : Float {
  de&&mand_eq( type( c ), type_float );
  /**/ return value( c );
  // For TypeScript, use mem32f
  //a/ return mem32f[ ( c << 1 ) ];
  //c/ return *( ( Float * ) ( c << 4 ) );
}



/* ---------------------------------------------------------------------------
 *  Dynamic areas of cells.
 *  Dynamic memory allocation of cells in the heap.
 *  Bytes areas are allocated and freed using a reference counter.
 *  Each busy area has two header cells that contain the reference counter and
 *  a size. When the area is free, the first header links to the next free area.
 *  ToDo: should reuse the platform provided malloc/free to the extend
 *  it is possible?
 *  All ptr are to regular InoxCells, all sizes are number of bytes. The header
 *  is two cells long and is stored before the area.
 *  ToDo: size optimisation where name of ref counter also encodes the size.
 *  This would be usefull for small areas, boxed values and proxied objects.
 *  dynrc1 would mean one cell, ie 8 bytes + 8 bytes header. This
 *  is a total of 16 bytes versus the non optimized 24 bytes.
 */

// The first cell of a busy header is the reference counter.
const tag_dynamic_ref_count = tag( "_dynrc" );

// When the area is freed, that header is overwritten with this tag.
const tag_dynamic_next_area = tag( "_dynxt" );

// The second cell of the header is the ajusted size of the area in bytes.
const tag_dynamic_area_size = tag( "_dynsz" );

// This is where to find the size relative to the area first header address.
const offset_of_area_size = ONE;

const the_first_ever_area = the_next_free_cell;

function init_areas_allocator() : Index {
  the_first_free_area = 0;
  // ToDo: until the bug with the allocator is fixed, get by with a big area
  // const big_area = allocate_area( INOX_HEAP_SIZE / 2 );
  // free_area( big_area );
  return 1;
}
let init_areas_allocator_done = init_areas_allocator();


function area_header( area : Cell ) : Cell {
  // Return the address of the first header cell of a byte area, the ref count.
  return area - 2 * ONE;
}

function header_to_area( header : Cell ) : Cell {
  // Return the address of an area given the address of it's first header cell.
  return header + 2 * ONE;
}



function area_ref_count( area : Cell ) : Value {
// Return the reference counter of a byte area
  alloc_de&&mand( is_busy_area( area ) );
  return value( area_header( area ) );
}


function set_area_busy( area : Cell ){
// Set the reference count header of a byte area to 1
  const header = area_header( area );
  // Before it becomes busy, it was free, so it has a next_area header.
  alloc_de&&mand_cell_name( header, tag_dynamic_next_area );
  set( header, type_integer, tag_dynamic_ref_count, 1 );
}


function set_area_free( area : Cell ){
// Set the tag of the header of a byte area to tag_dynamic_next_area
  set_name( area_header( area ), tag_dynamic_next_area );
}


function is_busy_area( area : Cell ) : boolean {
// Return true if the area is busy, false if it is free
  return name( area_header( area ) ) == tag_dynamic_ref_count;
}


function is_free_area( area : Cell ) : boolean {
// Return true if the area is free, false if it is busy
  return name( area_header( area ) ) == tag_dynamic_next_area;
}


function is_dynamic_area( area : Cell ) : boolean {
// Return true if the area is a dynamic area, false otherwise
  // This is maybe not 100% reliable, but it is good enough.
  const auto_first_header_ok = is_busy_area( area ) || is_free_area( area );
  if( ! auto_first_header_ok )return false;
  const auto_second_header_ok
  = name( area_header( area ) + ONE ) == tag_dynamic_area_size;
  return auto_second_header_ok;
}


function next_area( area : Cell ) : Cell {
// Return the address of the next free area
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_free_area( area ) );
  const next_area = value( area_header( area ) );
  alloc_de&&mand( next_area == 0 || is_safe_area( next_area ) );
  return value( area_header( area ) );
}


function set_next_area( area : Cell, nxt : Cell ){
// Set the address of the next free area
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_free_area( area ) );
  set_value( area_header( area ), nxt );
}


function set_area_ref_count( area : Cell, v : Value ){
// Set the reference counter of a byte area
  alloc_de&&mand( is_busy_area( area ) );
  set_value( area_header( area ), v );
}


function area_size( area : Cell ) : Size {
// Return the size of a byte area, in bytes. It includes the 2 header cells.
  alloc_de&&mand_cell_name(
    area_header( area ) + offset_of_area_size * ONE,
    tag_dynamic_area_size
  );
  return value( area_header( area ) + offset_of_area_size );
}

function area_capacity( area : Cell ) : Length {
// Return the capacity, in cells. It does not include the 2 header cells
  return to_cell( area_size( area ) ) - 2;
}


function set_area_size( area : Cell, s : Size ) : void {
// Set the size of a byte area, it includes the header
  const header = area_header( area );
  // The second header is after the first one, ie after the ref count.
  set( header + offset_of_area_size, type_integer, tag_dynamic_area_size, s );
}


function adjusted_bytes_size( s : Size ) : Size {
  // Align on size of cells and add size for heap management
  // The header is two cells, first is the ref count, second is the size.
  let aligned_size
  = 2 * size_of_cell
  + ( s + ( size_of_cell - 1 ) ) & ~( size_of_cell - 1 );
  return aligned_size;
}


// All budy lists are empty at first, index is number of cells in area
/**/  const all_free_lists_by_area_length : Array< Cell >
/**/  = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
/*c{
u32 all_free_lists_by_area_length[ 10 ]
= { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
}*/


/* -----------------------------------------------------------------------------
 *  Pretty naive garbadge collector.
 *  It is not at all a classical mark and sweep collector. It just scans
 *  the whole memory to join consecutive free areas. First it frees
 *  all areas of size 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
 *  It is incremental in the sense that it does not scan the whole memory
 *  at once, but only a small part of it. It is called by the interpreter
 *  when it is idle or when it needs more memory.
 */

let   last_visited_cell = 0;
const collector_increment = 1000;
let   something_was_collected = false;

function area_free_small_areas() : boolean {
// Free all small areas, ie all areas of size 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  something_was_collected = false;
  let ii;
  for( ii = 0 ; ii < 10 ; ii++ ){
    let free;
    while( ( free = all_free_lists_by_area_length[ ii ] ) != 0 ){
      all_free_lists_by_area_length[ ii ] = next_area( free );
      set_next_area( free, the_first_free_area );
      the_first_free_area = free;
      de&&mand( is_free_area( free ) );
      something_was_collected = true;
    }
  }
  return something_was_collected;
}


function area_garbage_collector() : boolean {
  // Garbage collect the dynamic areas. Return false if nothing was collected.

  // Set the default return value
  something_was_collected = false;

  // First empty all the "per length" free lists, they interfere.
  if( area_free_small_areas() ){
    something_was_collected = true;
  }

  // Then scan the entire heap and coalesce consecutive free areas.
  // ToDo: another option would have been to keep a sorted list of free areas.


  // Limit the time taken, don't restart from the beginning nor end too far
  let cell = last_visited_cell;
  if( cell < the_very_first_cell ){
    cell = the_very_first_cell;
  }

  let count_visited = 0;
  let cells_in_heap = the_next_free_cell - the_very_first_cell;

  while( true ){

    // Exit loop if too much time has been spent, unless nothing was collected
    if( count_visited > collector_increment && something_was_collected )break;

    // Time is proportional to the number of cells visited
    count_visited++;

    // When all cells have been visited, exit loop
    if( count_visited >= cells_in_heap )break;

    // OK, advance to next cell. Note: cell 0 is never visited, that's ok
    cell += ONE;

    // Time to restart if last cell was reached
    if( cell >= the_next_free_cell ){
      cell = the_very_first_cell;
      continue;
    }

    // Detect areas, continue if none found
    if( !is_dynamic_area( cell + 2 * ONE ) )continue;

    // If busy, skip it
    if( !is_free_area( cell + 2 * ONE ) ){
      cell += to_cell( area_size( cell + 2 * ONE ) );
      continue;
    }

    // The area is after two header cells, ptr to next area and size
    cell += 2 * ONE;

    alloc_de&&mand( is_free_area( cell ) );

    // Coalesce consecutive free areas, as long as there are some
    while( true ){

      // ToDo: if size were not aligned, it should be aligned here
      const potential_next_area = cell + to_cell( area_size( cell ) );

      if( potential_next_area >= the_next_free_cell
      || !is_dynamic_area( potential_next_area )
      || !is_free_area( potential_next_area )
      )break;

      // Coalesce consecutive two free areas
      let total_size = area_size( cell ) + area_size( potential_next_area );
      set_area_size( cell, total_size );
      set_next_area( cell, next_area( potential_next_area ) );
      reset( area_header( potential_next_area ) );
      reset( area_header( potential_next_area ) + ONE );
      // If that was the head of the free list, update it
      if( the_first_free_area == potential_next_area ){
        the_first_free_area = cell;
      }
      something_was_collected = true;

    } // End of while( true ) over consecutive free areas

  } // End of while( true ) over all cells

  return something_was_collected;

}


function area_garbage_collector_all(){
// Run garbage collector until nothing is collected
  // First compact the free cells used by allocate_cell()
  compact_free_cells();
  // Start from the beginning and loop until nothing is collected
  last_visited_cell = 0;
  // Loop until nothing is collected
  while( area_garbage_collector() );
}


function allocate_area( s : Size ) : Cell {
// Allocate a byte area, return its address, or 0 if not enough memory

  /**/ if( de ){
  /**/   if( s > 1000 ){
  /**/     if( s != INOX_HEAP_SIZE / 2 ){
  /**/       bug( S()+ "Large memory allocation, " + N( s ) );
  /**/       debugger;
  /**/     }
  /**/   }
  /**/   // alloc_de&&mand( size != 0 );
  /**/ }

  // Was something broken?
  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );

  // Align on 64 bits, size of a cell, plus size of headers
  let adjusted_size = adjusted_bytes_size( s );

  // Search in "per length" free lists if size is small enough
  if( adjusted_size <= 10 * size_of_cell
    //c/ && false  // ToDo: disabled for now, it's not working in C++
  ){
    let try_length = to_cell( adjusted_size );
    let small_free_area = all_free_lists_by_area_length[ try_length ];
    if( small_free_area ){
      all_free_lists_by_area_length[ try_length ]
      = next_area( small_free_area );
      set_area_busy( small_free_area );
      // ToDo: isn't size already correct?
      set_area_size( small_free_area, try_length * size_of_cell );
      return small_free_area;
    }
  }

  // Search first fit, starting from the first item of the free area list
  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );
  let area = the_first_free_area;
  let area_sz = 0;
  let previous_area = 0;
  let limit = 1000;
  while( area ){

    // Never loop forever
    if( limit-- == 0 ){
      FATAL( "Infinite loop in allocate_area" );
      return 0;
    }

    alloc_de&&mand( is_safe_area( area ) );
    alloc_de&&mand( is_free_area( area ) );
    area_sz = area_size( area );

    if( area_sz < adjusted_size ){
      // The area is too small, try next one
      previous_area = area;
      area = next_area( area );
      continue;
    }

    // The area is big enough, use it
    if( previous_area ){
      // The area is not the first one, remove it from the list
      alloc_de&&mand_eq( next_area( previous_area ), area );
      set_next_area( previous_area, next_area( area ) );
    }else{
      // The area is the first one, update the list
      alloc_de&&mand_eq( area, the_first_free_area );
      the_first_free_area = next_area( area );
      alloc_de&&mand(
        the_first_free_area == 0 || is_safe_area( the_first_free_area )
      );
    }

    // Break big area and release extra space
    let remaining_size = area_sz - adjusted_size;

    // Only split if the remaining area is big enough for headers
    if( remaining_size >= 2 * size_of_cell ){
      let remaining_area = area + to_cell( adjusted_size);
      set_area_size( remaining_area, remaining_size );
      set_area_free( remaining_area );
      set_next_area( remaining_area, next_area( area ) );
      if( the_first_free_area ){
        alloc_de&&mand( is_safe_area( the_first_free_area ) );
        set_next_area( remaining_area, the_first_free_area );
      }
      the_first_free_area = remaining_area;
      alloc_de&&mand( is_safe_area( remaining_area ) );
      alloc_de&&mand( is_free_area( remaining_area ) );

    }else{
      // The area is too small to split, use it all
      adjusted_size = area_sz;
    }

    // Mark the found area as busy
    set_area_busy( area );
    set_area_size( area, adjusted_size );

    alloc_de&&mand( is_safe_area( area ) );
    alloc_de&&mand( is_busy_area( area ) );
    alloc_de&&mand( is_last_reference_to_area( area ) );
    alloc_de&&mand_neq( area, the_first_free_area );
    alloc_de&&mand(
      the_first_free_area == 0 || is_safe_area( the_first_free_area )
    );
    return area;
  }

  // If nothing was found, allocate more memory for the heap and retry
  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );

  // Add some extra cells to avoid too many small allocations
  let extra_cells = 128;

  // Don't forget the cell for the refcount and size headers
  let needed_cells = to_cell( adjusted_size ) + extra_cells + 2;

  const cells = allocate_cells( needed_cells );
  alloc_de&&mand( cells + needed_cells * ONE <= the_next_free_cell );

  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );

  // Skip the refcount and size headers future headers
  area = cells + 2 * ONE;

  // Pretend it is a busy area and then free it to add it to the heap
  set_area_free( area );
  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );
  set_area_busy( area );
  set_area_size( area, adjusted_size + extra_cells * size_of_cell );
  alloc_de&&mand( is_safe_area( area ) );
  free_area(     area );

  // Retry the allocation, it should work now
  const allocated_area = allocate_area( s );

  // The result should be the newly added area but without the extra cells
  alloc_de&&mand_eq( allocated_area, area );
  alloc_de&&mand_eq(
    area + to_cell( adjusted_size ),
    the_first_free_area
  );
  alloc_de&&mand_eq(
    area_size( the_first_free_area ),
    extra_cells * size_of_cell
  );

  // Defensive
  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );

  return allocated_area;

}


function resize_area( a : Cell, s : Size ) : Cell {
  alloc_de&&mand( is_safe_area( a ) );
  let ii = area_size( a );
  if( s <= ii ){
    // ToDo: should split the area and free the extra space
    return a;
  }
  const new_mem = allocate_area( s );
  while( true ){
    ii -= size_of_cell;
    // ToDo: should copy cell if previous area is referenced somewhere?
    alloc_de&&mand( area_ref_count( a ) <= 1 );
    move_cell( a + ii * size_of_cell, new_mem + ii * size_of_cell );
    if( ii == 0 )break;
  }
  free_area( a );
  return new_mem;
}

function free_area( area : Cell ){

  if( area == 0 ){
    // Assume it's about the empty text, ""
    debugger;
    return;
  }

  if( de
  && the_empty_text_cell != 0
  && area == value( the_empty_text_cell )
  ){
    // What! free of the empty text, ""?
    trace( "Internal err, free of the empty text" );
    // FATAL( "Internal error, free of the empty text" );
    return; // ToDo: handle this properly
  }

  alloc_de&&mand( is_safe_area( area ) );
  const old_count = area_ref_count( area );

  // Just decrement the reference counter if it's not the last reference
  if( old_count != 1 ){
    set_area_ref_count( area, old_count - 1 );
    return;
  }

  // The whole area should be full of zeros, ie cleared
  if( de ){
    const capacity = area_capacity( area );
    let ii;
    for( ii = 0 ; ii < capacity ; ii++ ){
      mand_empty_cell( area + ii * ONE );
    }
  }

  // Add to a "per length" free list if small enough area
  const size = area_size( area );
  if( size <= 10 * size_of_cell ){
    set_area_free( area );
    set_next_area(
      area,
      all_free_lists_by_area_length[ to_cell( size ) ]
    );
    all_free_lists_by_area_length[ to_cell( size ) ] = area;
    // ToDo: this can degenerate when too many small areas are unused.
    // I should from time to time empty the free lists and add areas to the
    // global pool, the older areas first to maximize locality.
    // That is what collect_garbage() does, supposedly.
    // ToDo: when is collect_garbage() called?
    return;
  }

  // Add area in free list
  // ToDo: insert area in sorted list instead of at the start?
  // I should do this to coalesce adjacent free areas to avoid fragmentation
  set_area_free( area );
  alloc_de&&mand(
    the_first_free_area == 0 || is_safe_area( the_first_free_area )
  );
  set_next_area( area, the_first_free_area );
  the_first_free_area = area;
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_free_area( area ) );
}


function lock_area( area : Cell ) : void {
// Increment reference counter of bytes area allocated using allocate_bytes().
// When free_bytes() is called, that counter is decremented and the area
// is actually freed only when it reaches zero.
  if( area == 0 ){
    // Assume it's about the empty text, "".
    return;
  }
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  const old_count = area_ref_count( area );
  // Increment reference counter
  const new_count = old_count + 1;
  set_area_ref_count( area, new_count );
}


function is_last_reference_to_area( area : Cell ) : boolean {
  // When the last reference disappears the bytes must be freed.
// To be called by clear_cell() only, on non zero adresses.
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  return area_ref_count( area ) == 1;
}


function is_safe_area( area : Cell ) : boolean {
// Try to determine if the address points to a valid area allocated
// using allocates_area() and not already released.

  if( !alloc_de )return true;

  // This helps to debug unbalanced calls to lock_area() and free_area().
  // zero is ok for both reference counter & size because it never happens
  if( area == 0 ){
    return true;
  }

  // The address must be in the heap
  if( area < the_very_first_cell
  ||  area - 2 * ONE >= the_next_free_cell
  ){
    FATAL( S()+ "Invalid area, not in the heap, " + C( area ) );
    return false;
  }

  // The address must be aligned on a cell boundary
  if( area % ( size_of_cell / size_of_word ) != 0 ){
    FATAL( S()+ "Invalid area, not aligned on a cell boundary, " + C( area ) );
    return false;
  }

  // The address must be in the heap
  if( area < the_first_ever_area ){
    FATAL( S()+ "Invalid area before the first cell, " + C( area ) );
    return false;
  }

  if( area - 2 * ONE >= the_next_free_cell ){
    FATAL( S()+ "Invalid area after the end, " + C( area ) );
    return false;
  }

  if( is_busy_area( area ) ){

    // The reference counter must be non zero if busy
    const reference_counter = area_ref_count( area );
    if( reference_counter == 0 ){
      FATAL( S()
        + "Invalid reference counter for area, " + N( reference_counter )
        + " " + N( area )
      );
      return false;
    }

    // When one of the 4 most significant bits is set, that's a type id probably
    if( reference_counter >= ( 1 << 28 ) ){
      const type = unpack_type( reference_counter );
      FATAL( S()+ "Invalid counter for area? " + N( type ) + " " + C( area ) );
      return false;
    }

  }

  // The size must be bigger than the size of the headers
  const size = area_size( area );
  if( size <= 2 * ( size_of_cell / size_of_word ) ){
    FATAL( S()+ "Invalid size for area, " + N( size ) + " " + C( area ) );
    return false;
  }

  // The whole area must be in the heap
  if( area + to_cell( size ) > the_next_free_cell ){
    FATAL( S()+
      "Invalid area, out of heap, size " + N( size ) + ", " + C( area )
    );
    return false;
  }

  // When one of the 4 most significant bits is set, that's a type id probably
  if( size >= ( 1 << 28 ) ){
    const type = unpack_type( size );
    FATAL( S()+ "Invalid counter for area? " + N( type ) + " " + C( area ) );
    return false;
  }

  // The size must be a multiple of the size of a cell
  if( size % ( size_of_cell / size_of_word ) != 0 ){
    FATAL( S()+ "Invalid size for area " + N( size ) + " " + C( area ) );
    return false;
  }

  // The size must be smaller than the heap size
  if( size > ( the_next_free_cell - the_first_ever_area ) * size_of_cell ){
    FATAL( S()+ "Invalid size for area " + N( size ) + " " + C( area ) );
    return false;
  }

  return true;
}


function increment_object_ref_count( area : Cell ){
  lock_area( area );
}


function decrement_object_ref_count( area : Cell ){
  free_area( area );
}


function area_test_suite(){
  // This was generated by copilot, it is very insufficent
  const the_area = allocate_area( 10 );
  de&&mand( is_safe_area( the_area ) );
  de&&mand( is_busy_area( the_area ) );
  free_area( the_area );
  de&&mand( is_free_area( the_area ) );
  const the_area2 = allocate_area( 10 );
  de&&mand( is_safe_area( the_area2 ) );
  de&&mand( is_busy_area( the_area2 ) );
  lock_area( the_area2 );
  de&&mand( is_busy_area( the_area2 ) );
  de&&mand( is_safe_area( the_area2 ) );
  free_area( the_area2 );
  de&&mand( is_safe_area( the_area2 ) );
  de&&mand( is_busy_area( the_area2 ) );
  free_area( the_area2 );
  de&&mand( is_free_area( the_area ) );
}


/* -----------------------------------------------------------------------
 *  Reference, type 4, 32 bits to reference a dynamically allocated array
 *  of cells, aka a smart pointer to an Inox object.
 */

function set_reference_cell( c : Cell, v : Value ){
  set( c, type_reference, tag_reference, v );
}


function cell_reference( c : Cell ) : Value {
  check_de&&mand_eq( is_a_reference_cell( c ) ? 1 : 0, 1 );
  return value( c );
}


/* -----------------------------------------------------------------------
 *  Proxy opaque object, type 5
 *  These objects are platform provided objects. Access is done using an
 *  indirection table.
 *  ToDo: implement using dynamically allocated bytes.
 *  ToDo: define a base class to be derived by more specific classes.
 */

// Access to proxied object is opaque, there is an indirection.
// Each object has an id which is a cell address. Cells that
// reference proxied object use that cell address as a pointer.
// Indirection table to get access to an object using it's id.
// The id is the address of a dynamically allocated cell that is
// freed when the reference counter reaches zero.
// When that happens, the object is also deleted from the map.

// In Typescript, there is a parallel map, in C++, a cell is used
/**/ let all_proxied_objects_by_id = new Map< Cell, any >();

//c/ static Tag tag_c_string = tag( "c_string" );

function make_proxy( object : any ) : Index {
  // In Typescript there is map between the id and the object
  /**/ const proxy = allocate_area( 0 );
  // In C++, the cell holds a char* to a strdup() of the LeanString object
  //c/ Cell  proxy = allocate_area( 1 );
  alloc_de&&mand( is_safe_area( proxy ) );
  /**/ all_proxied_objects_by_id.set( proxy, object );
  //c/ set( proxy, type_integer, tag_c_string, (int) object );
  // de&&mand_eq( value( proxy ), 0 );
  // de&&mand_eq( info(  proxy ), 0 );
  // ToDo: cache an _inox_tag into the constructor to avoid call to tag()
  // const class_name = tag( object.constructor.name );
  // In Typescript, proxy cell does not actually exists, only the id is used
  alloc_de&&mand( is_safe_area( proxy ) );
  alloc_de&&mand( is_busy_area( proxy ) );
  return proxy;
}


function set_proxy_cell( c : Cell, proxy : Index ){
  alloc_de&&mand( is_safe_area( proxy ) );
  set(
    c,
    type_proxy,
    /**/ tag( proxied_object_by_id( proxy ).constructor.name ),
    //c/ tag_c_string,
    proxy
  );
}


let the_empty_text_proxy = 0;


function free_proxy( proxy : Cell ){
// This is called by clear_cell() when reference counter reaches zero
  de&&mand_neq( proxy, the_empty_text_proxy );
  alloc_de&&mand( is_safe_area( proxy ) );
  alloc_de&&mand( is_busy_area( proxy ) );
  /**/ all_proxied_objects_by_id.delete( proxy );
  //c/ free( (void*) value( proxy ) );
  //c/ reset( proxy );
  // ToDo: debug this
  // free_area( proxy );
}


function proxied_object_by_id( id : Cell ) : any {
  alloc_de&&mand( is_safe_area( id ) );
  /**/ return all_proxied_objects_by_id.get( id );
  //c/ return (const void*) value( id );
}


function cell_proxied_object( c : Cell ) : any {
 const area = value( c );
  alloc_de&&mand( is_safe_area( area ) );
  /**/ return proxied_object_by_id( area );
  //c/ return (const void*) value( area );
}


function proxy_to_text( area : Cell ) : Text {
  alloc_de&&mand( is_safe_area( area ) );
  // Some special case 0 produces the empty text.
  if( !area )return no_text;
  /*!c{*/
    if( !all_proxied_objects_by_id.has( area ) ){
      if( de ){
        bug( S()+ "Attempt to convert a non proxy object to text" );
        debugger;
      }
      return "";
    }
    let obj = all_proxied_objects_by_id.get( area );
    return obj.toString ? obj.toString() : "";
  /*}{
    de&&mand_cell_name( area, tag_c_string );
    return TxtD( (const char*) value( area ) );
  }*/
}


/* -----------------------------------------------------------------------
 *  Text, type 6
 *  Currently implemented in typescript using a proxy object, a string.
 *  C++ implementation uses a one cell area with strdup() as value.
 *  ToDo: use allocate_area() to implement a local strdup()?
 *  ToDo: use such a local strdup() even in Typescript?
 */

function set_text_cell( c : Cell, txt : ConstText ){
  if( tlen( txt ) == 0 ){
    alloc_de&&mand( is_safe_area( value( the_empty_text_cell ) ) );
    copy_cell( the_empty_text_cell, c );
    return;
  }
  // ToDo: I could cache the proxy object to avoid creating a new one
  // using a map, const text_cache = new Map< text, proxy >();
  // If the text is already in the cache, increment the reference counter.
  /**/ const proxy = make_proxy( txt );
  //c/ Index proxy = make_proxy( _strdup( txt.c_str() ) );
  set( c, type_text, tag_text, proxy );
  de&&mand( cell_looks_safe( c ) );
  de&&mand( teq( cell_to_text( c ), txt ) );
}

function free_text( oid : Index ){
  // In C++, it's a strdup() allocated memory area
  //c/ free( (void*) value( oid ) );
  free_proxy( oid );
}


/* -----------------------------------------------------------------------------
 *  ToDo: a custom string implementation.
 *  This is to avoid using the native string implementation.
 *  It should handle UTF-8, UTF-16, UTF-32, etc.
 *  It should be able to handle strings of any length.
 *  It should be able to handle strings of u8, u16, u32, etc.
 *  It is actually more a buffer than a string.
 *  That's not needed initially, but it will be needed later.
 *
 *  For very small strings, 3 chars at most, I could store them in the
 *  address itself with some kind of encoding where the last byte is set to 0?
 *  That would require that such a case never happens when allocate_area()
 *  returns a new area. It would be endian dependent and possible only
 *  when the lowest byte of the address is stored at the highest address,
 *  ie big ending. A big-endian system stores the most significant byte of
 *  a word at the smallest memory address and the least significant byte
 *  at the largest. On little endian, this would require the addresses to be
 *  limited to 20 bits, which is OK as long as 24 bits addressable memory
 *  is OK, ie 16 MB. Another option is to handle short string of 2 chars
 *  at most and have allocate_area() avoid returning an address with the
 *  sentinel byte set to 0.
 */


/* -----------------------------------------------------------------------
 *  ToDo: a custome map implementation.
 *  This is an optimisation to avoid the sequential search in the stacks.
 *  ToDo: study AssemblyScript's Map implementation.
 */


/* -----------------------------------------------------------------------
 *  Verb type
 *  Verbs are named references to blocks of code.
 *  The name of a word is the name of the value.
 *  The definition was found in the dictionary.
 *  ToDo: have multiple dictionaryies, one per module and one global.
 *  ToDo: unify dictionaries with objects.
 *  ToDo: unify verbs and tags.
 *  The value is the address where the Inox verb is defined is the VM
 *  memory. That definition is built using regular 64 bits cells.
 *  The definition is called a block.
 *  Verbs are never deallocated, like tags.
 */


// The dictionary of all verbs, including class.method verbs.
// ToDo: There should be a global dictionnary and local ones. This is
// necessary when importing verbs from modules.
// ToDo: study C++ namespaces.


// The default definition is literal default:/default
const the_default_verb_type  = type_tag;
const the_default_verb_name  = tag( "default" );
const the_default_verb_value = the_default_verb_name;


function init_default_verb_value() : Cell {
  const c = allocate_cell();
  // Default verb value is a named void cell
  set(
    c,
    the_default_verb_type,
    the_default_verb_name,
    the_default_verb_value
  );
  // ToDo: could it be the_void_cell?
  return c;
}


const the_default_verb_definition_value = init_default_verb_value();


function init_default_verb_definition() : Cell {
  // The default definition is a block that pushes a default:void value.
  const header = allocate_cells( 3 );
  set(
    header,
    type_integer,
    the_default_verb_name,
    2 // length & flags
  );
  const def = header + 1 * ONE;
  set(
    def,
    type(  the_default_verb_definition_value ),
    name(  the_default_verb_definition_value  ),
    value( the_default_verb_definition_value  )
  );
  set_return_cell( def + 1 * ONE );
  register_definition( the_default_verb_name, def );
  return def;
}


const the_default_verb_definition = init_default_verb_definition();


function find_definition( verb_tag : Tag ) : Cell {
// Find a verb definition in the dictionary
  // Lookup in symbol table
  const d = get_definition( verb_tag );
  if( d == 0 ){
    return the_default_verb_definition;
  }
  return d;
}


function verb_exists( n : TxtC ) : boolean {
// Check if a verb exists in the dictionary
  // Check tag existence first
  if( !tag_exists( n ) ){
    return false;
  }
  const verb_tag = tag( n );
  // Then check if the verb was defined
  return definition_exists( verb_tag );
}


function find_definition_by_name( n : TxtC ) : Cell {
// Find a verb in the dictionary
  // Check tag existence first
  if( !tag_exists( n ) ){
    return the_default_verb_definition;
  }
  const verb_tag = tag( n );
  const d = get_definition( verb_tag );
  if( d == 0 ){
    return 0;
  }
  return d;
}


function definition( id : Index  ) : Cell {
// Given a verb, as a tag, return the address of its definition
  const def = find_definition( id );
  de&&mand_eq( def, get_definition( id ) );
  return def;
}


function definition_by_name( n : Text ) : Cell {
  if( !tag_exists( n ) ){
    return the_default_verb_definition;
  }
  return definition( tag( n ) );
}


const verb_flags_mask     = 0xff00000; // Mask for all flags
const verb_length_mask    = 0x00fffff; // Mask for length
const max_block_length    =   0xfffff; // Max length of a block, 20 bits


function mand_definition( def : Cell ) : boolean {
  // The header with length & flags is right before the code
  const header = def - ONE;
  if( type( header ) == type_integer )return true;
  const n = name( header );
  FATAL( S()
    + "Not a definition: " + C( n ) + " " + tag_to_text( n )
    + " at cell " + C( def )
  );
  return false;
}


function definition_length( def : Cell ) : Index {
  // The header with length & flags is right before the code
  const header = def - ONE;
  de&&mand_definition( def );
  const length = value( header ) & verb_length_mask;
  de&&mand( length > 0 );
  return length;
}


function set_definition_length( def : Cell, length : Count ){
// Hack used only by the global primitive to turn a constant into variable
  // The header with length & flags is right before the code
  const header = def - ONE;
  de&&mand_cell_type( header, type_integer );
  if( length > max_block_length ){
    FATAL( S()+ "Too large definition, maximum is " + N( max_block_length ) );
  }
  // Do not change the flags, only the length
  const flags = value( header ) & verb_flags_mask;
  set_value( header, flags | length );
}


/* -----------------------------------------------------------------------
 *  class/method lookup
 */

// Typescript version
/*!c{*/

// ToDo: implement Map as an object
const class_cache      = new Map< Value, Cell >();
const method_cache     = new Map< Value, Cell >();
const definition_cache = new Map< Value, Cell >();


function find_method( class_tag : Tag, method_tag : Tag ) : Cell {
// Find a method in the dictionary

  // First check the cache
  // ToDo: figure out a better hash function, 13 is an arbitrary number
  const hashcode = ( class_tag << 13 ) + method_tag;
  if( definition_cache.has( hashcode )
  &&  class_cache.get(      hashcode ) != class_tag
  &&  method_cache.get(     hashcode ) != method_tag
  ){
    return definition_cache.get( hashcode );
  }

  // Slow version, lookup in the dictionary
  const fullname = tag_to_text( class_tag ) + "." + tag_to_text( method_tag );
  const def = find_definition_by_name( fullname );
  if( def == 0 ){
    return 0;
  }
  cache_method( class_tag, method_tag, def );

}


function cache_method( klass : Tag, method : Tag, def : Cell ){
// Register a method in the method dictionary
  // ToDo: better hash function
  const hashcode = ( klass << 13 ) + method;
  class_cache.set(      hashcode, klass );
  method_cache.set(     hashcode, method );
  definition_cache.set( hashcode, def );
}


// C++ version
/*}{

#define METHOD_CACHE_LENGTH 1009 // A prime number
static Tag  class_cache[      METHOD_CACHE_LENGTH ];
static Tag  method_cache[     METHOD_CACHE_LENGTH ];
static Cell definition_cache[ METHOD_CACHE_LENGTH ];

static Count cache_hits = 0;
static Count cache_misses = 0;


void cache_method( Tag klass, Tag method, Cell def ){
  // ToDo: implement using some better hash function
  const hashcode = ( ( klass << 13 ) + method ) % METHOD_CACHE_LENGTH;
  class_cache[      hashcode ] = klass;
  method_cache[     hashcode ] = method;
  definition_cache[ hashcode ] = def;
}


Cell find_method( Tag class_tag, Tag method_tag ){
  // Try in cache first
  const hashcode = ( ( class_tag << 13 ) + method_tag ) % METHOD_CACHE_LENGTH;
  if( class_cache[  hashcode ] == class_tag
  &&  method_cache[ hashcode ] == method_tag
  ){
    cache_hits++;
    return definition_cache[ hashcode ];
  }
  // Slow version
  cache_misses++;
  auto class_name  = tag_to_text( class_tag );
  auto method_name = tag_to_text( method_tag );
  auto fullname    = class_name + "." + method_name;
  auto ii = all_symbol_cells_length;
  while( --ii >= 0 ){
    Text t = all_symbol_texts[ ii ];
    if( teq( t, fullname ) ){
      auto def = all_definitions[ ii ];
      // Update cache
      cache_method( class_tag, method_tag, def );
      return all_definitions[ def ];
    }
  }
  return 0;
}

}*/


function register_method_definition( verb_tag : Tag, def : Cell ){
// Define a verb
  // There is a header is the previous cell, for length & flags.
  // The definition is an array of verbs with literals, primitive ids and
  // verb ids, aka a block. See RUN() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the verb.

  de&&mand_cell_name( def - 1 * ONE, verb_tag );
  de&&mand_cell_type( def - 1 * ONE, type_integer );

  // Register the verb in the global symbol table
  register_definition( verb_tag, def );

  // Detect cccc.mmmmm verbs, ie method verbs
  const auto_fullname = tag_to_text( verb_tag );
  const dot_position  = tidx( auto_fullname, "." );
  if( dot_position > 0 ){
    const auto_class_name  = tcut( auto_fullname, dot_position );
    const auto_method_name = tbut( auto_fullname, dot_position + 1 );
    if( auto_method_name != "" ){
      const class_tag  = tag( auto_class_name );
      const method_tag = tag( auto_method_name );
      cache_method( class_tag, method_tag, def );
    }
  }
}


/* -----------------------------------------------------------------------------
 *  Flags for Inox verbs
 *  Each verb has a header cell with packed flags and length.
 *  The length is the number of cells in the definition.
 *  The definition follows, hence it looks like it is a block.
 */

const immediate_verb_flag = 0x8000000; // Run when compiling even when compiling
const hidden_verb_flag    = 0x4000000; // ToDo: skipped when lookup
const operator_verb_flag  = 0x2000000; // Parser knows about left associativity
const block_verb_flag     = 0x1000000; // True for blocks, false for verbs
const inline_verb_flag    = 0x0800000; // When compiling inline definition
const primitive_verb_flag = 0x0400000; // True for primitives
const dynamic_verb_flag   = 0x0200000; // True for dynamic anonymous verbs
const misc2_verb_flag     = 0x0100000; // For future use


// A block has a header cell with packed flags and length
const tag_block_header = tag( "block-header" );


function set_verb_flag( id : InoxWord, flag : Value ){
  const header = definition( id ) - ONE;
  set_value( header, ( value( header ) & verb_length_mask ) | flag );
}


function test_verb_flag( id : InoxWord, flag : Value ) : Index {
  const header = definition( id ) - ONE;
  return ( value( header ) & flag ) == flag ? 1 : 0;
}


function set_verb_immediate_flag( id : Index ){
  set_verb_flag( id, immediate_verb_flag );
}


function is_immediate_verb( id : Index ) : Index {
  return test_verb_flag( id, immediate_verb_flag );
}


function set_verb_hidden_flag( id : Index ){
  set_verb_flag( id, hidden_verb_flag );
}


function is_hidden_verb( id : Index ) : Index {
   return test_verb_flag( id, hidden_verb_flag );
}


function set_verb_operator_flag( id : Index ){
  set_verb_flag( id, operator_verb_flag );
}


function is_operator_verb( id : Index ) : Index {
  return test_verb_flag( id, operator_verb_flag );
}


function set_verb_block_flag( id : Index ){
  set_verb_flag( id, block_verb_flag );
}


function is_an_inline_block_cell( c : Cell ) : boolean {
  return name( c ) == tag_block_header;
}


function is_block_ip( ip : Cell ) : boolean {
  de&&mand_cell_name( ip, tag_block_header );
  return ( value( ip ) & block_verb_flag ) != 0;
}


function set_inline_verb_flag( id : Index ){
  set_verb_flag( id,  inline_verb_flag );
}


function is_inline_verb( id : Index ) : Index {
  return test_verb_flag( id, inline_verb_flag );
}


function set_verb_primitive_flag( id : Index ){
  set_verb_flag( id, primitive_verb_flag );
}


function is_primitive_verb( id : Index ) : Index {
  return test_verb_flag( id, primitive_verb_flag );
}


/* -----------------------------------------------------------------------------
 *  Flow, type 8
 *  ToDo: Reactive dataflows on reactive data sets from Toubkal.
 *  Currently implemented using a proxy object.
 *  See https://github.com/ReactiveSets/toubkal
 */

// a flow is about statefull/stateless, sync/async, greedy/lazy.
// a flow carries data sets.
// add/remove/update events change the data set.
// one can subscribe to such events or generate them.
// open/close events change the flow state.


/* -----------------------------------------------------------------------------
 *  List, type 9
 *  ToDo: implement this type
 *  It should be a Lisp language style of list, with a head and a tail.
 */

/*
 *  a-list? primitive
 */

/*
 *  nil? primitive
 */


/*
 *  list primitive
 */


/*
 *  list-cons primitive
 */


/*
 *  list-car primitive
 */


/*
 *  list-head primitive
 */


/*
 *  list-tail primitive
 */


/*
 *  list-cdr primitive
 */


/*
 *  list-set-car primitive
 */


/*
 *  list-set-cdr primitive
 */


/*
 *  list-length primitive
 */


/*
 *  list-append primitive
 */


/*
 *  list-reverse primitive
 */


/*
 *  list-last primitive
 */


/*
 *  list-nth primitive
 */


/*
 *  list-member primitive
 */


/*
 *  list-copy primitive
 */


/*
 *  list-equal? primitive
 */


/* -----------------------------------------------------------------------------
 *  Some types are reference types, some are value types
 */

// ToDo: reorder types to have reference types last
// First verb, then boolean, integer, pointer (raw), then reference types
// ToDo: make verb 0 the void verb and get rid of type_void
// ToDo: get rid of type_tag and use type_verb instead
// ToDo: add a type for a reference to a cell, named pointer
// ToDo: change pointer (to object) back into reference
// As a result there would be only two types of types: verb & literals


/**/ const   is_reference_type_array = [
//c/ boolean is_reference_type_array[ 16 ] = {
false, false, false, false,
true,  true,  true,  false,
false, false, false, false,
false, false, false, false
/**/ ];
//c/ };

function check_types() : Index {
  de&&mand_eq( type_void,      0x0 );
  de&&mand_eq( type_boolean,   0x1 );
  de&&mand_eq( type_tag,       0x2 );
  de&&mand_eq( type_integer,   0x3 );
  de&&mand_eq( type_verb,      0x4 );
  de&&mand_eq( type_float,     0x5 );
  de&&mand_eq( type_reference, 0x6 );
  is_reference_type_array[     0x6 ] = true;
  de&&mand_eq( type_proxy,     0x7 );
  is_reference_type_array[     0x7 ] = true;
  de&&mand_eq( type_text,      0x8 );
  is_reference_type_array[     0x8 ] = true;
  de&&mand_eq( type_flow,      0x9 );
  is_reference_type_array[     0x9 ] = true;
  de&&mand_eq( type_list,      0xA );
  is_reference_type_array[     0xA ] = true;
  de&&mand_eq( type_invalid,   0xC );
  return 1;
}

const check_types_done = check_types();


function is_a_reference_type( t : Index ) : boolean {
  // ToDo: faster t >= type_reference?
  return is_reference_type_array[ t ];
}


function needs_clear( c : Cell ) : boolean {
  return is_a_reference_type( type( c ) );
}


/* ----------------------------------------------------------------------------
 *  The three global "registers" are: IP, TOS and CSP.
 *
 *  IP is the instruction pointer, the address of the next instruction to
 *  execute.
 *
 *  TOS, Top Of the Stack, is the address of the top of the data stack.
 *
 *  CSP, Control Stack Pointer, is the address of the top of the control stack.
 *
 *  Ideally those registers should be in registers of the CPU, but in Javascript
 *  they are global variables. In C++ there could a solution to have them in
 *  registers, based on tricking the compiler. ToDo: study that.
 *
 *  Additionaly there is an ACTOR global variable that is the address of the
 *  current actor. It is used to implement multi threading.
 *
 *  All addresses points to 64 bits memory cells. The first 32 bits are the
 *  value of the cell, the second 32 bits are the type and name of the cell.
 *  Cells addresses are 32 bits integers whose value must be multiplied by
 *  the size of a cell in order to get a byte address.
 */

/**/ let IP : number = 0;
//c/ static i32 IP;

/**/ let TOS : number = 0;
//c/ static i32 TOS;

/**/ let CSP : number = 0;
//c/ static i32 CSP;


/* ----------------------------------------------------------------------------
 *  Cell content access, checked, without or with clearing
 */

function mand_type( actual : Index, expected : Index ) :boolean {
  if( actual == expected )return true;
  let auto_msg = S();
  auto_msg += "Bad type, "    + N( actual )   + "/" + type_to_text( actual   );
  auto_msg += " vs expected " + N( expected ) + "/" + type_to_text( expected );
  bug( auto_msg );
  return mand_eq( actual, expected );
}


function mand_name( actual : Index, expected : Index ) : boolean {
  if( actual == expected )return true;
  let auto_msg = S();
  auto_msg += "Bad name, "    + N( actual )   + " /" + tag_to_text( actual   );
  auto_msg += " vs expected " + N( expected ) + " /" + tag_to_text( expected );
  bug( auto_msg );
  return mand_eq( actual, expected );
}


function mand_cell_type( c : Cell, type_id : Index ) : boolean {
// Assert that the type of a cell is the expected type.
  const actual_type = type( c );
  if( actual_type == type_id )return true;
  let auto_msg = S();
  auto_msg += "Bad type for cell " + C( c );
  auto_msg += ", expected " + N( type_id )
  + "/" + type_to_text( type_id );
  auto_msg += " vs actual " + N( actual_type )
  + "/" + type_to_text( actual_type );
  bug( auto_msg );
  // ToDo: should raise a type error
  return mand_type( type( c ), type_id );
}


function mand_tag( c : Cell ) : boolean {
  return mand_cell_type( c, type_tag );
}


function mand_integer( c : Cell ) : boolean {
  return mand_cell_type( c, type_integer );
}


function mand_boolean( c : Cell ) : boolean {
  return mand_cell_type( c, type_boolean );
}


function mand_verb( c : Cell ) : boolean {
// Check that the cell is a verb
  return mand_cell_type( c, type_verb );
}


function mand_block( c : Cell ) : boolean {
// ToDo: should there be a block type? or is verb ok?
  mand_cell_type( c, type_integer );
  // The value should point to a block
  const block = value( c );
  // Block have an header that is the block's length & flags
  return mand_cell_type( block - ONE, type_integer );
}


function mand_cell_name( c : Cell, n : Tag ) : boolean{
// Assert that the type of a cell is the expected type.
  const actual_name = name( c );
  if( actual_name == n )return true;
  let auto_msg = S();
  auto_msg += "Bad name for cell " + C( c );
  auto_msg += ", expected " + N( n )
  + " /" + tag_to_text( n );
  auto_msg += " vs actual " + N( actual_name )
  + " /" + tag_to_text( actual_name );
  bug( auto_msg );
  // ToDo: should raise a type error
  return mand_name( name( c ), n );
}


function mand_void_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the integer type.
  return mand_cell_type( c, type_void );
}


function mand_boolean_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the boolean type.
  return mand_cell_type( c, type_boolean );
}


function mand_tag_cell( cell  : Cell ) : boolean {
// Assert that the type of a cell is the tag type.
  return mand_cell_type( cell, type_tag );
}


function mand_reference_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the integer type.
  return mand_cell_type( c, type_reference );
}


function mand_proxy_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the integer type.
  return mand_cell_type( c, type_proxy );
}


function mand_text_cell( cell : Cell ) : boolean {
// Assert that the type of a cell is the text type.
  return mand_cell_type( cell, type_text );
}


function mand_verb_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the integer type.
  return mand_cell_type( c, type_verb );
}


function  eat_raw_value( c : Cell ) : Index {
  // Like value() but also clear the cell, assuming it is not a reference
  const v = value( c );
  reset( c );
  return v;
}


function  get_tag( c : Cell ) : Index {
// Like value() but check that the cell is a tag
  check_de&&mand_tag_cell( c );
  return value( c );
}

function  get_integer( c : Cell ) : Index {
// Like value() but check that the cell is an integer
  check_de&&mand_integer( c );
  return value( c );
}


function  eat_tag( c : Cell ) : Tag {
// Like eat_raw_value() but check that the cell is a tag
  check_de&&mand_tag( c );
  return eat_raw_value( c );
}


function  eat_integer( c : Cell ) : Index {
// Like eat_raw_value() but check that the cell is an integer
  check_de&&mand_integer( c );
  return eat_raw_value( c );
}


function  eat_boolean( c : Cell ) : Index {
// Like eat_raw_value() but check that the cell is a boolean
  check_de&&mand_boolean( c );
  return eat_raw_value( c );
}


function  eat_value( c : Cell ) : Index {
// Like value() but also clear the cell
  const v = value( c );
  clear( c );
  return v;
}


function  pop_raw_value() : Value {
// Like eat_raw_value() but pop the cell from the stack
  return eat_raw_value( POP() );
}


function  pop_value() : Value {
// Like eat_value() but pop the cell from the stack
  return eat_value( POP() );
}


function  pop_block() : Cell {
// Pop a block from the stack
  check_de&&mand_block( TOS );
  return pop_raw_value();
}


function  pop_tag() : Tag {
// Pop a tag from the stack
  check_de&&mand_tag( TOS );
  return pop_raw_value();
}


function  pop_integer() : Value {
// Pop an integer from the stack
  check_de&&mand_integer( TOS );
  return pop_raw_value();
}


function  pop_boolean() : Index {
  check_de&&mand_boolean( TOS );
  return pop_raw_value();
}


function pop_verb() : Tag {
  check_de&&mand_verb( TOS );
  return pop_raw_value();
}


function  get_boolean( c : Cell ) : Index {
// Like value() but check that the cell is a boolean
  check_de&&mand_boolean( c );
  return value( c );
}


function mand_reference( c : Cell ) : boolean {
// Check that the cell is a reference
  check_de&&mand( is_a_reference_cell( c ) );
  return true;
}


function  pop_reference() : Cell {
  check_de&&mand_reference( TOS );
  return pop_raw_value();
}


function  eat_reference( c : Cell ) : Cell {
// Like eat_value() but check that the cell is a reference
  check_de&&mand_reference( c );
  return eat_value( c );
}


function  get_reference( c : Cell ) : Cell {
// Like value() but check that the cell is a reference
  check_de&&mand_reference( c );
  return value( c );
}


function pop_as_text() : Text {
// Pop a cell from the data stack and return it's text representation
  const cell = POP();
  const auto_txt = cell_to_text( cell );
  clear( cell );
  return auto_txt;
}


/* ----------------------------------------------------------------------------
 *  Helpers to push values on the stack
 */

function push_text( t : TxtC ){
  PUSH();
  set_text_cell( TOS, t );
}


function push_tag( t : Tag ){
  PUSH();
  set_tag_cell( TOS, t );
}


function push_verb( t : Tag ){
  PUSH();
  set_verb_cell( TOS, t );
}


function push_integer( i : Index ){
  PUSH();
  set_integer_cell( TOS, i );
}


function push_boolean( b : boolean ){
  PUSH();
  set_boolean_cell( TOS, b ? 1 : 0 );
}


function push_true(){
  push_boolean( true );
}


function push_false(){
  push_boolean( false );
}


function push_proxy( proxy : Index ){
  PUSH();
  set_proxy_cell( TOS, proxy );
}


/* -----------------------------------------------------------------------------
 *  Some global cells
 */
const tag_the_empty_text = tag( "the-empty-text" );

function init_the_empty_text_cell() : Index {
  the_empty_text_cell = allocate_cell();
  the_empty_text_proxy = make_proxy( "" );
  set(
    the_empty_text_cell,
    type_text,
    tag_the_empty_text,
    the_empty_text_proxy
  );
  alloc_de&&mand( is_safe_area( value( the_empty_text_cell ) ) );
  // It's only now that testing the area allocator is possible.
  area_test_suite();
  return 1;
}
let init_the_empty_text_cell_done = init_the_empty_text_cell();


/* ----------------------------------------------------------------------------
 *  Helpers to dump the memory
 */


// Set to last seen invalid cell by dump()
let dump_invalid_cell = 0;

function memory_dump(){

  // First, let's collect all garbage
  area_garbage_collector_all();

  // Then let's dump each cell
  let count = 0;
  let delta_void = 0;
  let count_voids = 0;
  let previous = the_very_first_cell - ONE;
  let c = previous;
  const limit = the_next_free_cell;

  trace( S()+ "\nMEMORY DUMP\n"
  + "from " + N( the_very_first_cell ) + " to " + N( limit ) + "\n"
  + N( limit - the_very_first_cell ) + " cells\n\n"
  );

  while( ++c < limit ){

    // Skip void cells
    if( value( c ) == 0 && info( c ) == 0 )continue;

    // Non void after the_last_cell is problematic...
    if( c >= the_next_free_cell ){
      trace( "Warning: " + C( c ) + " >= the_last_cell" );
    }

    // Trace about consecutive skipped void cells
    if( c != previous + ONE ){
      delta_void = ( c - previous ) / ONE - 1;
      // One void could be the last cell of a definition
      if( delta_void > 1 ){
        // Count voids that for sure are not the last cell of a definition
        // There is an exception, see the hack in make-constant
        count_voids += delta_void - 1;
        trace( "void - " + N( delta_void ) + " cells" );
      }else{
        trace( "void" );
      }
    }

    // ToDo: count heap cells, busy, free, total, etc.

    // voids are calls to primitives sometimes
    // ToDo: type_primitive?
    if( type( c ) == type_void
    &&  name( c ) != tag( "_dynrc" ) // Not reference counter of dynamic area
    &&  name( c ) != tag( "_dynsz" ) // Not size of dynamic area
    &&  name( c ) != tag( "_dynxt" ) // Not next free cell of dynamic area
    &&  name( c ) != tag_list        // Not free cell in allocate_cell()'s list
    ){
      // OK, let's assume it's a primitive
      trace( "" + C( c ) + ": " + dump( c )
      + " - " + inox_machine_code_cell_to_text( c ) );
    }else{
      trace( "" + C( c ) + ": " + dump( c ) );
    }
    count++;
    previous = c;
  }

  if( dump_invalid_cell != 0 ){
    trace( "\nWarning: " + C( dump_invalid_cell ) + " is not a valid cell" );
  }

  const total_cells = count + count_voids;
  trace(
    "\n\nTotal: "
    + N( total_cells ) + " cells, "
    + N( count )                       + " busy & "
    + N( count_voids )                 + " void, "
    + N( total_cells * ONE )           + " words & "
    + N( total_cells * size_of_cell )  + " bytes, "
    + N( count       * size_of_cell )  + " bytes busy & "
    + N( count_voids * size_of_cell )  + " bytes void"
  );

}


/* -----------------------------------------------------------------------------
 *  Float64, Array, Map, List
 *  ToDo: Currently implemented as proxy objects
 *  ToDo: implement arrays as dynamically allocated arrays of cells
 *  ToDo: implement maps as dynamically allocated arrays of cells
 *  ToDo: implement lists using name and value of cell?
 */

/*!c{*/


function set_array_cell( c : Cell, obj? : Object ){
  let array = obj;
  if( ! obj ){
    array = new Array< Cell >();
  }
  set_proxy_cell( c, make_proxy( array ) );
}


function set_map_cell( c : Cell, obj? : Object ){
  let map = obj;
  if( ! obj ){
    map = new Map< InoxOid, Cell >();
  }
  set_proxy_cell( c, make_proxy( map ) );
}


function set_list_cell( c : Cell, obj? : Object ){
  // ToDo: value should a linked list of cells
  let list = obj;;
  if( ! obj ){
    list = new Array< Cell >();
  }
  set_proxy_cell( c, make_proxy( list ) );
}

/*}*/


/* --------------------------------------------------------------------------
 *  Actor class
 */


// Global state about currently running actor

// The current actor
/**/ let  ACTOR : Cell = 0;
//c/ static Cell ACTOR = 0;

// The base of the data stack of the current actor
/**/ let   ACTOR_data_stack : Cell = 0;
//c/ static Cell  ACTOR_data_stack = 0;

// The base of the control stack of the current actor
/**/ let  ACTOR_control_stack : Cell = 0;
//c/ static Cell ACTOR_control_stack   = 0;

// The upper limit of the data stack of the current actor
/**/ let  ACTOR_data_stack_limit : Cell = 0;
//c/ static Cell ACTOR_data_stack_limit = 0;

// The upper limit of the control stack of the current actor
/**/ let  ACTOR_control_stack_limit : Cell = 0;
//c/ static Cell ACTOR_control_stack_limit = 0;

// Names for classes and attributes
const tag_actor          = tag( "actor" );
const tag_data_stack     = tag( "data-stack" );
const tag_control_stack  = tag( "control-stack" );
const tag_ip             = tag( "ip" );
const tag_tos            = tag( "tos" );
const tag_csp            = tag( "csp" );


function data_stack_is_empty() : boolean {
  return TOS == ACTOR_data_stack;
}


function mand_actor( actor : Cell ) : boolean {

  check_de&&mand_cell_name( actor + 0 * ONE, tag_actor   );

  de&&mand_cell_name( actor + 1 * ONE, tag_data_stack    );
  de&&mand_cell_name( actor + 2 * ONE, tag_control_stack );
  de&&mand_cell_name( actor + 3 * ONE, tag_ip            );
  de&&mand_cell_name( actor + 4 * ONE, tag_ip            );
  de&&mand_cell_name( actor + 5 * ONE, tag_tos           );
  de&&mand_cell_name( actor + 6 * ONE, tag_csp           );
  de&&mand_integer(   actor + 0 * ONE );
  de&&mand_reference( actor + 1 * ONE );
  de&&mand_reference( actor + 2 * ONE );
  de&&mand_integer(   actor + 3 * ONE );
  de&&mand_integer(   actor + 4 * ONE );
  de&&mand_integer(   actor + 5 * ONE );
  de&&mand_integer(   actor + 6 * ONE );

  return true;

}


function make_actor( ip : Cell ) : Cell {

  // Allocate an object with 6 slots
  let actor = stack_allocate( 6 );

  // Set the class name to "actor" instead of default "stack"
  set_name( actor, tag_actor );

  // Allocate a data stack for the actor
  let dstk = stack_allocate( 100 );

  // Set the class name to "data-stack" instead of default "stack"
  set_name( dstk, tag_data_stack );

  // Allocate a control stack for the actor
  let cstk = stack_allocate( 100 );

  // Set the class name to "control-stack" instead of default "stack"
  set_name( cstk, tag_control_stack );

  // Now fill the object with the first 3 slots

  set( the_tmp_cell, type_reference, tag_data_stack, dstk );
  stack_push( actor, the_tmp_cell );   // offset 1, /data-stack

  set( the_tmp_cell, type_reference, tag_control_stack, cstk );
  stack_push( actor, the_tmp_cell );   // offset 2, /control-stack

  set( the_tmp_cell, type_integer, tag_ip, ip );
  stack_push( actor, the_tmp_cell );   // offset 3, /ip

  // The 3 next slots are to save the CPU context: ip, tos, csp
  set( the_tmp_cell, type_integer, tag_ip, ip );
  stack_push( actor, the_tmp_cell );   // offset 4, /ip

  set( the_tmp_cell, type_integer, tag_tos, dstk );
  stack_push( actor, the_tmp_cell );   // offset 5, /tos

  set( the_tmp_cell, type_integer, tag_csp, cstk );
  stack_push( actor, the_tmp_cell );   // offset 6, /csp

  de&&mand_actor( actor );

  return actor;
}


function actor_save_context(){
// Save context (ip, tos, csp) of current actor
  check_de&&mand_actor( ACTOR );
  set_value( ACTOR + 4 * ONE, IP );
  set_value( ACTOR + 5 * ONE, TOS );
  set_value( ACTOR + 6 * ONE, CSP );
}


function actor_restore_context( actor : Cell ){
// Restore context of actor, ie IP, TOS, CSP & stacks limits
  check_de&&mand_actor( actor );
  ACTOR = actor;
  IP     = get_integer( ACTOR + 4 * ONE );
  TOS    = get_integer( ACTOR + 5 * ONE );
  CSP    = get_integer( ACTOR + 6 * ONE );
  ACTOR_data_stack    = get_reference( ACTOR + 1 * ONE );
  ACTOR_control_stack = get_reference( ACTOR + 2 * ONE );
  ACTOR_data_stack_limit
  = ACTOR_data_stack    + stack_capacity( ACTOR_data_stack );
  ACTOR_control_stack_limit
  = ACTOR_control_stack + stack_capacity( ACTOR_control_stack );
}


function init_root_actor() : Index {
  actor_restore_context( make_actor( 0 ) );
  return 1;
}

const init_root_actor_done = init_root_actor();


/* ----------------------------------------------------------------------------
 *  Error handling
 *  ToDo: should abort unless some exception handler was set up
 */

function FATAL( message : TxtC ){
  // Simplified version during bootstrap
  if( in_lean_mode ){
    trace( S()+ "\nFATAL: " + message + "\n" );
    return;
  }
  // Display error and stacks. Clear stack & get back to eval loop
  trace( S()+ "\nFATAL: " + message + "\n" + stacks_dump() );
  debugger;
  primitive_clear_data();
  primitive_clear_control();
  // ToDo: should push something to get back to eval loop?
  IP = 0;
}


/* -----------------------------------------------------------------------
 *  Primitives
 */


const tag_return = tag( "return" );


function  primitive_by_tag( id : Index ) : Primitive {
  return get_primitive( id );
}


function primitive_exists( n : Tag ) : boolean {
  return primitive_by_tag( n ) != no_operation;
}


/* -----------------------------------------------------------------------
 *  Source code generation
 *  The idea is to generate a valid C code file that includes everything
 *  needed to run an Inox program or to integrate Inox as a C library.
 */

// Not on metal
/*!c{*/

let C_source = "#include \"inox.h\"\n#include \"inox.cpp\"\n";


function simplify_js_primitive( n : Text, source : Text ){
// Simplify the source code of a primitive so that it can compile in C.

  false && console.log( "Primitive " + n + " source code is :\n"
    + source
  );

  let s = source;
  let new_s = s;

  new_s = s
  .replace( /function\s*.*{/, "{" )
  .replace( /^(?=\n)$|^\s*|\s*$|\n\n+/gm,"" )
  .replace( /\/\*[ \n][\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1' )
  .replace( /^(?=\n)$|^\s*|\s*$|\n\n+/gm,"")
  .replace( /debugger;/gm, "INOX_debugger();" )
  .replace( /^\s*\n/gm, "" )
  .replace( /^de&&.*\n/gm, "" )
  .replace( /^.*_de && .*\n/gm, "" );
  //if( new_s != s ){ console.log( "1 is :\n" + new_s );s = new_s; }
  s = new_s;

  new_s = s.replace( "xx", "yy" );
  //if( new_s != s ){ console.log( "2 is :\n" + new_s ); debugger; s = new_s; }
  s = new_s;

  C_source += "\nvoid " + name + "( void )" + s + "\n\n";
  return new_s;

}

/*}*/


// Not on metal
/*!c{*/

function build_c_function_declaration( ts : Text ){
// Build the C function prototype from a TypeScript function prototype
  // Syntax is "function name( arg1 : type1, arg2 : type2, ... ) : rtype {"
  // We want "rtype name( type1 arg1, type2 arg2, ... ){"
  let new_s = ts
  .replace( /function\s*([a-zA-Z0-9_]+)\s*\((.*)\)\s*:\s*([a-zA-Z0-9_]+)\s*{/, "$3 $1( $2 ){" )
  .replace( /function\s*([a-zA-Z0-9_]+)\s*\((.*)\)\s*{/, "void $1( $2 ){" );
  // Now we have "rtype name( arg1 : type1, arg2 : type2, ... ) {" or
  // "void name( arg1 : type1, arg2 : type2, ... ) {"
  new_s = new_s
  .replace( /([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)/g, "$2 $1" );
  // Now we have "rtype name( type1 arg1, type2 arg2, ... ) {" or
  // "void name( type1 arg1, type2 arg2, ... ) {"
  // Handle the case of no arguments
  new_s = new_s.replace( /\(\s*\)/, "( void )" );
  return new_s;
}


function build_targets(){
// Build the C++ and AssemblyScript targets

  // Starting from this very file itself
  const source = require( "fs" ).readFileSync( "lib/inox.ts", "utf8" );

  // In C++, primitive declarations are postponed
  let all_primitive_declarations = "";

  // Split the source code into lines
  let ts = source.split( "\n" );

  // A very inefficient string builder, fast enough for this purpose
  let  c_source = "";

  let ii = 0;
  let line = "";
  let len = ts.length;

  // Hack to avoid interferences with comments in this function itself
  let  begin = "/" + "*";
  let  end   = "*" + "/";

  let last_ii       = -1;
  let blank_lines   = 0;
  let comment_lines = 0;
  let nchanges      = 0;

  // For each line
  for( ii = 0 ; ii < len ; ii++ ){

    line = ts[ ii ];

    // Skip empty lines
    if( line.match( /^\s*$/ ) ){
      blank_lines = blank_lines + 1;
      c_source += line + "\n";
      continue;
    }

    // Leave the line untouched if it is a true // comment
    if( line.match( /^\s*\/\/ / ) ){
      // This does not match the //x comments, a space is needed
      c_source += line + "\n";
      blank_lines = blank_lines + 1;
      continue;
    }

    // Leave line untouched if it starts with *, ie inside multiline comments
    if( line.match( /^\s*\* / ) ){
      // Together with // comments, this avoids interferences with comments
      c_source += line + "\n";
      comment_lines = comment_lines + 1;
      continue;
    }

    // Leave line untouched if it is a true /* comment
    if( line.match( /^\s*\/\* / ) ){
      c_source += line + "\n";
      comment_lines = comment_lines + 1;
      continue;
    }

    // Leave line untouched if it is the end of a /* comment
    if( line.match( /^\s*\*\/ / ) ){
      c_source += line + "\n";
      comment_lines = comment_lines + 1;
      continue;
    }

    function replace( regex, replacement ){
      // At most one change per line
      if( ii == last_ii )return;
      const new_line = line.replace( regex, replacement );
      if( new_line != line ){
        nchanges = nchanges + 1;
        line = new_line;
        last_ii = ii;
        // console.log( "Line " + line + "\n becomes " + new_line );
        // debugger;
      }
    }

    // Else, do some replacements

    // Turn "let auto_" into C++ local automatic variables
    // This takes advantage of C++ type inference
    replace( /^(\s+)let +auto_/, "$1 auto auto_"  );

    // Idem for "const auto_", turned into C++ local automatic variables
    replace( /^(\s+)const +auto_/, "$1 auto auto_"  );

    // Turn " let" into C++ i32 local variables
    replace( /^(\s+)let /,      "$1 i32 "  );

    // Idem with " const", turned into i32 C++ local variables
    replace( /^(\s+)const /,    "$1 i32 "  );

    // Turn global "let" and "const" into C++ global static i32 variables
    replace( /^let /,           "static i32 "  );
    replace( /^const /,         "static i32 "  );

    // / * * /, rest of line is removed, it's Typescript only code
    replace( /^\s*\/\*\*\/(.*)$/, " //ts/ $1 " );

    // //c/ lines are C++ lines
    replace( /^(\s*)\/\/c\/ (.*)$/, "$1$2  //c/ line" );

    // C++ one liners, ie //c/ xxxxx
    // replace( /^\s*\/\*c (.+?) c\*\//, "$1  //c/ line" );

    // start of not C++ version, ie / *!c{* /
    replace( begin + "!c{" + end,   " " + begin + "!c{" );

    // start of C++ version, ie /*c{
    replace( begin + "c{", " " + begin + "c{" + end );

    // end of C++, start of Typescript, ie / *}{* /
    replace( begin + "}{" + end, "n//" + begin + "}{" + end );

    // end of Typescript, start of C++, ie /*}{
    replace( begin + "}{", " //" + begin + "}{" + end );

    // end of ts, ie /*}
    replace( begin + "}", end + " //" + "}" );

    // end of C++, ie }* /
    replace( "}" + end, " //}" );

    // End of Typescript, ie / *}* /
    // replace( begin + "}" + end, " // ts end }" );

    // Collect all primitives
    replace( /^\s*primitive\(\s+"(\S+)",\s+(\w+)\s*\);$/,
      function( match, p1, p2, p3 ){
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    );
    replace( /^\s*operator_primitive\(\s+".+",\s+(\w+)\s*\);$/,
      function( match, p1, p2, p3 ){
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    );
    replace( /^\s*immediate_primitive\(\s+"(\S+)",\s+(\w+)\s*\);$/,
    function( match, p1, p2, p3 ){
      all_primitive_declarations += "\n" + match;
      return "// postponed: " + match;
    } );

    // Also collect the other "postponed" initializations, / *P* / marked
    replace( /^\s*\/\*P\*\/.*$/,
    function( match, p1, p2, p3 ){
      all_primitive_declarations += "\n" + match;
      return "// postponed: " + match;
    } );

    // Generate the void xx( void ) C++ declarations for primitives
    replace( /^function +(primitive_\w+)\(\)\{$/, "void $1( void ){ // ts $_" );

    // Generate the C++ declarations for other functions
    replace( /^(function +\w+\(.*\).*\{)$/, build_c_function_declaration );

    c_source += line + "\n";
  }

  // Inject the primitive declarations into init_globals(), see below
  c_source = c_source.replace(
    "ALL_PRIMITIVE_" + "DECLARATIONS",
    all_primitive_declarations
  );

  // Done, write the C++ source code
  require( "fs" ).writeFileSync( "builds/inox.cpp", c_source, "utf8" );

  console.log(
    "\nC++ source code generated,\n  "
    + len + " total lines, including\n  "
    + comment_lines + " comment lines,\n  "
    + blank_lines + " blank lines,\n  "
    + nchanges + " changes.\n"
   );

  // Now build the AssemblyScript version, much simpler

  let as_source = "";
  for( ii = 0; ii < ts.length; ii++ ){
    line = ts[ ii ]

    // / *ts* /, rest of line is removed
    .replace( /\/\*ts\*\/(.*$)/, "// ts $1 " )

    // //a/, rest of line is kept as code
    .replace( /\/\/a\/ (.*$)/, "$1 //as" );

    as_source += line + "\n";
  }

  // Done, write the AssemblyScript source code
  require( "fs" ).writeFileSync( "builds/inox.as.ts", as_source, "utf8" );

  // ToDo: build the Java version!

  // ToDo: what other versions?

}

/*}*/


/* ----------------------------------------------------------------------------
 *  Primitive builders
 */

/*
 *  Every block terminates with a void cell that means "return"
 */

function set_return_cell( c : Cell ){
  reset( c ); // named void instead of tag_return
  de&&mand( type( c ) == type_void );
  de&&mand( name( c ) == 0 );
}


/*
 *  Helper to define a primitive
 */

function primitive( n : TxtC, fn : Primitive ) : Tag {
  // It also defines a verb that calls that primitive

  // Assign a new primitive id to the new primitive, a tag
  let name_id = tag( n );

  // Help some code generation
  /**/ simplify_js_primitive( fn.name, fn.toString() );

  // Make a small verb that calls the primitives, length + code + return
  const header = allocate_cells( 3 );

  // Definition starts after that header
  const def = header + 1 * ONE;

  // flags and length, integer, same name as primitive
  set( header, type_integer, name_id, 0 );
  set_definition_length( def, 2 );

  // Add machine code to invoke the primitive, ie type void, see RUN()
  set( def + 0 * ONE, type_void, name_id, 0 );

  // Add "return", 0 actually.
  set_return_cell( def + 1 * ONE );

  register_method_definition( name_id, def );
  set_verb_primitive_flag( name_id );

  // Associate tag with native function
  register_primitive( name_id, fn  );

  blabla_de&&bug( S()
    + "Registering primitive " + n
    + ", tag id " + C( name_id )
    + ", definition at " + C( def )
  );

  // Some "defensive programming"
  de&&mand_eq(       definition( name_id ),  def                    );
  de&&mand_eq(   get_definition( name_id ),  definition( name_id )  );
  de&&mand_eq(   definition_length( def ),   2                      );
  de&&mand_eq(       header,                 def - 1 * ONE          );
  de&&mand_cell_name( header,                name_id                );

  nde&&bug( verb_to_text_definition( name_id ) );

  return name_id;

}


function immediate_primitive( n : TxtC, fn : Primitive ){
// Helper to define an immediate primitive
// In eval, immediate Inox verbs are executed instead of being
// added to the new Inox verb definition that follows the "define" verb
  primitive( n, fn );
  set_verb_immediate_flag( tag( n ) );
}


function operator_primitive( n : TxtC, fn : Primitive ){
// Helper to define an operator primitive
  primitive( n, fn );
  set_verb_operator_flag( tag( n ) );
}

/* ----------------------------------------------------------------------------
 *  Let's define some primitives
 */

/*
 *  a-primitive? primitive - true if TOS tag is also the name of a primitive
 */

const tag_is_a_primitive = tag( "a-primitive?" );

function primitive_is_a_primitive(){
  let tag_name = eat_tag( TOS );
  let is_a_primitive = primitive_exists( tag_name );
  set( TOS, type_boolean, tag_is_a_primitive, is_a_primitive ? 1 : 0 );
}
primitive( "a-primitive?", primitive_is_a_primitive );


/*
 *  return primitive - jump to return address
 */

function primitive_return(){
// primitive "return" is jump to return address. Eqv R> IP!
  // ToDo: this should be primitive 0
  debugger;
  run_de&&bug( S()
    + "primitive, return to IP " + C( value( CSP ) )
    + " from " + C( name( CSP ) ) + "/" + tag_to_text( name( CSP) )
  );
  debugger;
  IP = eat_integer( CSP );
  CSP += ONE;
  // ToDo: detect special cases, including:
  // - spaggethi stacks, see https://wiki.c2.com/?SpaghettiStack
  // - stacks with a dynamic sizes, made of smaller stacks linked together.
  // One way to do this detection is simply to push a special verb onto
  // the control stack, say grown-stack for the dynamic size case.
  // Then that verb could pop the address of the previous stack from to
  // bottom cell of the current one.
  // For spaggethi stacks, the child thread should increment the reference
  // counter of the parent dynamic stack so that it is not deallocated when
  // either the parent or the child thread returns but only when the parent
  // thread and all the child thread terminate. This would enable the
  // implementation of the infamous call/cc (call with continuation) to
  // implement various structures, including closures. See the unimplemented
  // "act" property, short for activation record, of the Actor class below.
  // Pushed to the extrement, every cell would need a reference counter. But
  // that would be too expensive and some better technic for garbage collection
  // would help. I may reconsider this when/if such garbage collection is
  // introduced in AssemblyScript or WebAssembly runtime itself.
}
primitive( "return", primitive_return );


// Special case for primitive return, it gets two ids, 0 and normal.
// ToDo: avoid this
/**/ de&&mand_eq( tag_void, 0x0000 );
/*P*/ register_primitive( 0, primitive_return );
// Patch verb definition to reference verb 0
/*P*/ set_return_cell( definition( tag_return ) );


function trace_context( msg : TxtC ){
  bug( S()
    + "\n" + msg
    + "\n" + stacks_dump()
    + "\nIP: " + inox_machine_code_cell_to_text( IP ) + "\n"
  );
}


/*
 *  actor primitive - push a reference to the current actor
 */

/**/ function set_tos_name( n : Tag ){ set_name( TOS, n ); }
//c/ #define  set_tos_name( n       )  set_name( TOS, n )


function primitive_actor(){
// Push a reference to the current actor
  push_integer( ACTOR ); // ToDo: push_reference()?
  set_tos_name( tag_actor );
}
primitive( "actor", primitive_actor );


/*
 *  switch-actor primitive - non preemptive thread switch
 */

function primitive_switch_actor(){
  actor_restore_context( pop_reference() );
}
primitive( "switch-actor", primitive_switch_actor );


/*
 *  make-actor primitive - create a new actor with an initial IP
 */


function primitive_make_actor(){
  // ToDo: it gets a copy of the data stack?
  const actor = make_actor( pop_integer() );
  set( PUSH(), type_reference, tag_actor, actor );
};
primitive( "make-actor", primitive_make_actor );


/*
 *  breakpoint primitive - to break into the debugger
 */

function primitive_breakpoint(){
  breakpoint();
}
primitive( "breakpoint", primitive_breakpoint );


/*
 *  memory-dump primitive
 */

primitive( "memory-dump", memory_dump );


/*
 *  cast primitive - change the type of a value, unsafe
 */

function primitive_cast(){
  // ToDo: use tag for type
  // ToDo: check that the type is valid
  const type = pop_raw_value();
  check_de&&mand( type > 0 && type < type_invalid );
  set_type( TOS, type );
}
primitive( "cast", primitive_cast );


/*
 *  rename primitive - change the name of the NOS value
 */

function primitive_rename(){
  const name = pop_raw_value();
  set_tos_name( name );
}
primitive( "rename",  primitive_rename );


// It is needed during code compilation
const tag_rename = tag( "rename" );


/*
 *  goto primitive - jump to some absolue IP position, a branch
 */

function primitive_goto(){
  // ToDo: conditional jumps
  IP += pop_integer();
}
primitive( "goto", primitive_goto );


/* ----------------------------------------------------------------------------
 *  Primitives to tests the type of a cell
 */


/*
 *  a-void? primitive - true if TOS is a void type of cell
 */

function is_a_void_cell( c : Cell ) : boolean {
  return type( c ) == type_void;
}

const tag_is_a_void = tag( "a-void?" );

function  primitive_is_a_void(){
  const it_is = is_a_void_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_void, it_is ? 1 : 0 );
}
primitive( "a-void?", primitive_is_a_void );


/*
 *  a-tag? primitive
 */

function is_a_tag_cell( c : Cell ) : boolean {
  return type( c ) == type_tag;
}

const tag_is_a_tag = tag( "a-tag?" );

function primitive_is_a_tag(){
  const it_is = is_a_tag_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_tag, it_is ? 1 : 0 );
}
primitive( "a-tag?", primitive_is_a_tag );


/*
 *  a-boolean? primitive
 */

function is_a_boolean_cell( c : Cell ) : boolean {
  return type( c ) == type_boolean;
}

const tag_is_a_boolean = tag( "a-boolean?" );

function primitive_is_a_boolean(){
  const it_is = is_a_boolean_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_boolean, it_is ? 1 : 0 );
}
primitive( "a-boolean?", primitive_is_a_boolean );


/*
 *  an-integer? primitive
 */

const tag_is_an_integer = tag( "an-integer?" );

function primitive_is_an_integer(){
  const it_is = is_an_integer_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_an_integer, it_is ? 1 : 0 );
}
primitive( "an-integer?", primitive_is_an_integer );


/*
 *  a-text? primitive
 */

function is_a_text_cell( c : Cell ) : boolean {
  return type( c ) == type_text;
}

const tag_is_a_text = tag( "a-text?" );

function primitive_is_a_text(){
  const it_is = is_a_text_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_text, it_is ? 1 : 0 );
}
primitive( "a-text?", primitive_is_a_text );


/*
 *  a-reference? primitive
 */

function is_a_reference_cell( c : Cell ) : boolean {
  return type( c ) == type_reference;
}

const tag_is_a_reference = tag( "a-reference?" );

function primitive_is_a_reference(){
  const it_is = is_a_reference_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_reference, it_is ? 1 : 0 );
}
primitive( "a-reference?", primitive_is_a_reference );


/*
 *  a-verb? primitive
 */

const tag_is_a_verb = tag( "a-verb?" );

function is_a_verb_cell( c : Cell ) : boolean {
  return type( c ) == type_verb;
}

function primitive_is_a_verb(){
  const it_is = is_a_verb_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_verb, it_is ? 1 : 0 );
}
primitive( "a-verb?", primitive_is_a_verb );


/*
 *  a-proxy? primitive
 */

function is_a_proxy_cell( c : Cell ) : boolean {
  return type( c ) == type_proxy;
}

const tag_is_a_proxy = tag( "a-proxy?" );

function primitive_is_a_proxy(){
  const it_is = is_a_proxy_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_proxy, it_is ? 1 : 0 );
}
primitive( "a-proxy?", primitive_is_a_proxy );


/*
 *  a-flow? primitive
 */

function is_a_flow_cell( c : Cell ) : boolean {
  return type( c ) == type_flow;
}

const tag_is_a_flow = tag( "a-flow?" );

function primitive_is_a_flow(){
  const it_is = is_a_flow_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_flow, it_is ? 1 : 0 );
}
primitive( "a-flow?", primitive_is_a_flow );


/*
 *  a-list? primitive
 */

function is_a_list_cell( c : Cell ) : boolean {
  return type( c ) == type_list;
}

const tag_is_a_list = tag( "a-list?" );

function primitive_is_a_list(){
  const it_is = is_a_list_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_list, it_is ? 1 : 0 );
}
primitive( "a-list?", primitive_is_a_list );


/* -----------------------------------------------------------------------------
 *  Forth style data stack manipulations.
 */


/*
 *  push primitive - push the void on the data stack
 */

function primitive_push(){
  PUSH();
}
primitive( "push", primitive_push );


/*
 *  drop primitive
 */

function primitive_drop(){
  clear( POP() );
};
primitive( "drop", primitive_drop );


/*
 *  drops primitive - drops n cells from the data stack
 */

function primitive_drops(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    if( TOS <= ACTOR_data_stack )break;
    clear( POP() );
  }
}
primitive( "drops", primitive_drops );


/*
 *  dup primitive - duplicates the top of the data stack
 */

function primitive_dup(){
  const tos = TOS;
  copy_cell( tos, PUSH() );
}
primitive( "dup", primitive_dup );


/*
 *  2dup primitive - duplicates the top two cells of the data stack
 */

function primitive_2dup(){
  const tos = TOS;
  copy_cell( tos - ONE, PUSH() );
  copy_cell( tos,       PUSH() );
}
primitive( "2dup", primitive_2dup );


/*
 *  ?dup primitive - duplicates the top of the data stack if it is not zero
 */

function primitive_dup_if(){
  // This is the Forth style of truth, anything non zero
  if( value( TOS ) ){
    copy_cell( TOS, PUSH() );
  }
}
primitive( "?dup", primitive_dup_if );


/*
 *  dups primitive - duplicates n cells from the data stack
 */

function primitive_dups(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    // ToDo: check overflow
    copy_cell( TOS, PUSH() );
  }
}
primitive( "dups", primitive_dups );


/*
 *  overs primitive - pushes n cells from the data stack
 *  ie : 2OVER 2 overs ;
 */

function primitive_overs(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  // ToDo: test this
  const base = TOS - ( 2 * ( n - 1 ) * ONE );
  for( ii = 0 ; ii < n ; ii++ ){
    copy_cell( base + ii * ONE, PUSH() );
  }
}
primitive( "overs", primitive_overs );


/*
 *  2over primitive - pushes the third and fourth cells from TOS
 */

function primitive_2over(){
  const tos = TOS;
  copy_cell( tos - 3 * ONE, PUSH() );
  copy_cell( tos - 2 * ONE, PUSH() );
}
primitive( "2over", primitive_2over );



/*
 *  nip primitive -
 */

function primitive_nip(){
  const old_tos = POP();
  reset_cell_value( TOS );
  move_cell( old_tos, TOS );
}
primitive( "nip", primitive_nip );


/*
 *  tuck primitive - pushes the second cell from the top of the stack
 */

function primitive_tuck(){
  const tos = TOS;
  const tos1 = tos - ONE;
  move_cell( tos,          the_tmp_cell );
  move_cell( tos1,         tos );
  move_cell( the_tmp_cell, tos1 );
}
primitive( "tuck", primitive_tuck );


/*
 *  swap primitive - swaps the top two cells of the data stack
 *  ie a b -- b a
 */

function primitive_swap(){
  const tos0 = TOS;
  const tos1 = tos0 - ONE;
  move_cell( tos0,         the_tmp_cell );
  move_cell( tos1,         tos0 );
  move_cell( the_tmp_cell, tos1 );
}
primitive( "swap", primitive_swap );


/*
 *  swaps primitive - swaps the top n cells of the data stack
 */

function primitive_swaps(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  // ToDo: test this
  for( ii = 0 ; ii < n ; ii++ ){
    const tos0 = TOS - ii * ONE;
    const tos1 = tos0 - ONE;
    move_cell( tos0,         the_tmp_cell );
    move_cell( tos1,         tos0 );
    move_cell( the_tmp_cell, tos1 );
  }
}
primitive( "swaps", primitive_swaps );


/*
 *  2swap primitive - swaps the top four cells of the data stack
 *  ie a1 a2 b1 b2 -- b1 b2 a1 a2
 */

function primitive_2swap(){
  const tos0 = TOS;
  const tos1 = tos0 - ONE;
  const tos2 = tos1 - ONE;
  const tos3 = tos2 - ONE;
  move_cell( tos0,         the_tmp_cell );
  move_cell( tos1,         tos0 );
  move_cell( tos2,         tos1 );
  move_cell( tos3,         tos2 );
  move_cell( the_tmp_cell, tos3 );
}
primitive( "2swap", primitive_2swap );


/*
 *  over primitive - pushes the second cell from the top of the stack
 */

function primitive_over(){
  const src = TOS - ONE;
  // WARNING, this bugs the C++ compiler: copy_cell( POS - 1, PUSH() );
  // Probably because it does not understand that PUSH() changes TOS and
  // does some optimizations that breaks... In C++, the compiler is
  // free to evaluate the arguments in the order it wants.
  copy_cell( src, PUSH() );
}
primitive( "over", primitive_over );


/*
 *  rotate primitive - rotates the top three cells of the data stack
 */

function primitive_rotate(){
  const tos0 = TOS;
  const tos1 = tos0 - ONE;
  const tos2 = tos1 - ONE;
  move_cell( tos0,         the_tmp_cell );
  move_cell( tos1,         tos0 );
  move_cell( tos2,         tos1 );
  move_cell( the_tmp_cell, tos2 );
}
primitive( "rotate", primitive_rotate );


/*
 *  roll primitive - rotates n cells from the top of the stack
 */

function primitive_roll(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  const tos = TOS;
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    move_cell( tos - ii * ONE, the_tmp_cell );
    move_cell( tos - ( ii + 1 ) * ONE, tos + ii * ONE );
    move_cell( the_tmp_cell, tos - ( ii + 1 ) * ONE );
  }
}
primitive( "roll", primitive_roll );


/*
 *  pick primitive - pushes the nth cell from the top of the stack
 */

function primitive_pick(){
  const nth = eat_integer( TOS );
  // ToDo: should check that nth is not too big
  copy_cell( TOS - nth * ONE, TOS );
}
primitive( "pick", primitive_pick );


/*
 *  data-depth primitive - pushes the depth of the data stack
 */

const tag_depth = tag( "depth" );

function primitive_data_depth(){
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  set( PUSH(), type_integer, tag_depth, depth );
}
primitive( "data-depth", primitive_data_depth );


/*
 *  clear-data primitive - clears the data stack
 */

function primitive_clear_data(){
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    clear( POP() );
  }
}
primitive( "clear-data", primitive_clear_data );


/*
 *  data-dump primitive - dumps the data stack
 */

function primitive_data_dump(){
  let auto_buf = S() + "DATA STACK";
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ++ii ){
    const c = TOS + ii * ONE;
    const i = info( c );
    auto_buf += "\n" + N( ii )
    + " " + type_to_text( unpack_type( i ) )
    + " " + tag_to_text(  unpack_name( i ) )
    + " " + cell_to_text( c );
  }
  trace( auto_buf );
}
primitive( "data-dump", primitive_data_dump );


/*
 *  control-depth primitive - pushes the depth of the control stack
 */

function primitive_control_depth(){
  const depth = ( ACTOR_control_stack - CSP ) / ONE;
  de&&mand( depth >= 0 );
  set( PUSH(), type_integer, tag_depth, depth );
}
primitive( "control-depth", primitive_control_depth );


/*
 *  clear-control primitive - clears the control stack
 */

const tag_clear_control = tag( "clear-control" );

function primitive_clear_control(){
  while( CSP > ACTOR_control_stack ){
    clear( CSP );
    CSP -= ONE;
  }
  CSP = ACTOR_control_stack;
  // Add a return to IP 0 so that return from verb exits RUN() properly
  set( CSP, type_integer, tag_clear_control, 0 );
}
primitive( "clear-control", primitive_clear_control );


/*
 *  control-dump primitive - dumps the control stack
 */

function                   primitive_control_dump(){
  const depth = ( CSP - ACTOR_control_stack ) / ONE;
  let   auto_buf = S() + "Control stack:";
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    const c = CSP - ii * ONE;
    const i = info(         c );
    const t = unpack_type(  i );
    const n = unpack_name(  i );
    auto_buf += "\n" + N( ii )
    + " " + type_to_text( t )
    + " " + tag_to_text(  n )
    + " " + cell_to_text( c );
  }
  trace( auto_buf );
}
primitive( "control-dump", primitive_control_dump );


/**/ function integer_to_text( v : Value ){ return "" + v; }
/*c{
  Text integer_to_text( Value v ){
    char buf[ 32 ];
    snprintf( buf, sizeof( buf ), "%i", v );
    return Text( buf );
  }
}*/


/*
 *  text-quote primitive - turns a string into a valid text literal
 */

function HEX( n : Value ) : Text {
// Convert integer to hex string
  // Typescript version:
  /**/ return n.toString( 16 );
  // C++ version
  /*c{
    char buf[ 32 ];
    sprintf_s( buf, sizeof( buf ), "%x", n );
    return Text( buf );
  }*/
}


function text_quote( txt : TxtC ) : Text {
  let auto_buf = S();
  let ii = 0;
  for( ii = 0; ii < tlen( txt ) ; ii++ ){
    const auto_ch = tmid( txt, ii, ii + 1 );
    if( teq( auto_ch, "\r" ) ){
      auto_buf += "\\r";
    }else if( teq( auto_ch, "\n" ) ){
      auto_buf += "\\n";
    }else if( teq( auto_ch, "\t" ) ){
      auto_buf += "\\t";
    }else if( teq( auto_ch, "\"" ) ){
      auto_buf += "\\\"";
    }else if( teq( auto_ch, "\\" ) ){
      auto_buf += "\\\\";
    }else if(
      /**/ auto_ch         < " "
      //c/ auto_ch.at( 0 ) < ' '
     ){
      /**/ auto_buf += "\\x" + HEX( auto_ch.charCodeAt( 0 ) );
      // In C++, get char code of first charactor of string
      //c/ auto_buf += "\\x" + HEX( auto_ch.at( 0 ) );
    }else{
      auto_buf += auto_ch;
    }
  }
  return "\"" + auto_buf + "\"";
}


function primitive_text_quote(){
  const auto_s = cell_to_text( TOS );
  clear( POP() );
  push_text( text_quote( auto_s ) );
}
primitive( "text-quote", primitive_text_quote );


/*c{

  // C++ version of parseInt( s, base )

  // ToDo: better handling of errors
  static bool parse_int_error = false;

  int parseInt( const Text& s, int base ){
    parse_int_error = true;
    int result = 0;
    for( unsigned int ii = 0 ; ii < s.length() ; ii++ ){
      result *= base;
      // Handle base 10
      if( base == 10 ){
        // Check that char is a digit
        if( s[ ii ] < '0' || s[ ii ] > '9' ){
          return 0;
        }
        result += s[ ii ] - '0';
      // Handle base 16
      }else if( base == 16 ){
        // Check that char is a digit
        if( s[ ii ] >= '0' && s[ ii ] <= '9' ){
          result += s[ ii ] - '0';
        }else if( s[ ii ] >= 'a' && s[ ii ] <= 'f' ){
          result += s[ ii ] - 'a' + 10;
        }else if( s[ ii ] >= 'A' && s[ ii ] <= 'F' ){
          result += s[ ii ] - 'A' + 10;
        }else{
          return 0;
        }
      // Handle base 8
      }else if( base == 8 ){
        // Check that char is a digit
        if( s[ ii ] >= '0' && s[ ii ] <= '7' ){
          result += s[ ii ] - '0';
        }else{
          return 0;
        }
      // Handle base 2
      }else if( base == 2 ){
        // Check that char is a digit
        if( s[ ii ] >= '0' && s[ ii ] <= '1' ){
          result += s[ ii ] - '0';
        }else{
          return 0;
        }
      // Handle other bases
      }else{
        return 0;
      }
    }
    parse_int_error = false;
    return result;
  }
}*/


/*
 *  text-to-integer primitive - converts a text literal to an integer
 */

function checked_text_to_integer( txt : TxtC ) : Value {
  // Typescript version:
  /**/ return parseInt( txt );
  // C++ version:
  /*c{
    int result = parseInt( txt, 10 );
    if( parse_int_error ){
      FATAL( "text-to-integer: invalid integer" );
    }
    return result;
  }*/
}


/*
 *  text-to-integer primitive - converts a text literal into an integer
 *  ToDo: should not FATAL on error
 */


function primitive_text_to_integer(){
  const auto_s = cell_to_text( TOS );
  clear( POP() );
  push_integer( checked_text_to_integer( auto_s ) );
}
primitive( "text-to-integer", primitive_text_to_integer );


/*
 *  text-hex-to-integer primitive - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_text_hex_to_integer( txt : TxtC ) : Value {
  // Typescript version:
  /**/ return parseInt( txt, 16 );
  // C++ version:
  /*c{
    int result = parseInt( txt, 16 );
    if( parse_int_error ){
      FATAL( "text-hex-to-integer: invalid integer" );
    }
    return result;
  }*/
}


function primitive_text_hex_to_integer(){
  const auto_t = cell_to_text( TOS );
  clear( POP() );
  push_integer( checked_text_hex_to_integer( auto_t ) );
}
primitive( "text-hex-to-integer", primitive_text_hex_to_integer );


/*
 *  text-octal-to-integer primitive - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_text_octal_to_integer( txt : TxtC ) : Value {
  // Typescript version:
  /**/ return parseInt( txt, 8 );
  // C++ version:
  /*c{
    int result = parseInt( txt, 8 );
    if( parse_int_error ){
      FATAL( "text-octal-to-integer: invalid integer" );
    }
    return result;
  }*/
}


function primitive_text_octal_to_integer(){
  const auto_t = cell_to_text( TOS );
  clear( POP() );
  push_integer( checked_text_octal_to_integer( auto_t ) );
}
primitive( "text-octal-to-integer", primitive_text_octal_to_integer );


/*
 *  text-binary-to-integer primitive - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_text_binary_to_integer( txt : TxtC ) : Value {
  // Typescript version:
  /**/ return parseInt( txt, 2 );
  // C++ version:
  /*c{
    int result = parseInt( txt, 2 );
    if( parse_int_error ){
      FATAL( "text-binary-to-integer: invalid integer" );
    }
    return result;
  }*/
}


function primitive_text_binary_to_integer(){
  const auto_t = cell_to_text( TOS );
  clear( POP() );
  push_integer( checked_text_binary_to_integer( auto_t ) );
}
primitive( "text-binary-to-integer", primitive_text_binary_to_integer );


/*
 *  integer-to-hex primitive - converts an integer to an hexadecimal text
 */

function primitive_integer_to_hex(){
  const i = pop_integer();
  // Typescript version:
  /**/ push_text( i.toString( 16 ) );
  // C++ version:
  /*c{
    char buf[ 32 ];
    sprintf_s( buf, sizeof( buf ), "%x", i );
    push_text( buf );
  }*/
}
primitive( "integer-to-hex", primitive_integer_to_hex );


/*
 *  integer-to-octal primitive - converts an integer to an octal text
 */

function primitive_integer_to_octal(){
  const i = pop_integer();
  // Typescript version:
  /**/ push_text( i.toString( 8 ) );
  // C++ version:
  /*c{
    char buf[ 48 ];
    sprintf_s( buf, sizeof( buf ), "%o", i );
    push_text( buf );
  }*/
}
primitive( "integer-to-octal", primitive_integer_to_octal );


/*
 *  integer-to-binary primitive - converts an integer to a binary text
 */

function primitive_integer_to_binary(){
  const i = pop_integer();
  // Typescript version:
  /**/ push_text( i.toString( 2 ) );
  // C++ version:
  /*c{
    char buf[ 33 ];
    buf[ 32 ] = '\0';
    for( int ii = 0 ; ii < 32 ; ii++ ){
      buf[ 31 - ii ] = ( ( i >> ii ) & 0x1 ) ? '1' : '0';
    }
    push_text( buf );
  }*/
}


/*
 *  text-unquote primitive - turns a JSON text into a text
 */

function text_unquote( txt : TxtC ) : Text {
  let auto_buf = S();
  let ii = 0;
  while( ii < tlen( txt ) ){
    const auto_ch = tmid( txt, ii, ii + 1 );
    if( teq( auto_ch, "\\" ) ){
      ii++;
      if( teq( auto_ch, "r" ) ){
        auto_buf += "\r";
      }else if( teq( auto_ch, "n" ) ){
        auto_buf += "\n";
      }else if( teq( auto_ch, "t" ) ){
        auto_buf += "\t";
      }else if( teq( auto_ch, "\"" ) ){
        auto_buf += "\"";
      }else if( teq( auto_ch, "\\" ) ){
        auto_buf += "\\";
      }else if( teq( auto_ch, "x" ) ){
        ii++;
        const auto_ch1 = tmid( txt, ii, ii + 1 );
        const auto_ch2 = tmid( txt, ii + 1, ii + 2 );
        const auto_hex = auto_ch1 + auto_ch2;
        const auto_dec = parseInt( auto_hex, 16 );
        /**/ auto_buf += String.fromCharCode( auto_dec );
        // In C++, get char code of first charactor of string
        //c/ auto_buf += char( auto_dec );
        ii++;
      }else{
        bug( S() + "Invalid escape sequence, \\" + auto_ch );
      }
    }else{
      auto_buf += auto_ch;
    }
    ii++;
  }
  return auto_buf;
}


function primitive_text_unquote(){
  const auto_t = cell_to_text( TOS );
  clear( POP() );
  push_text( text_unquote( auto_t ) );
}
primitive( "text-unquote", primitive_text_unquote );


/* -----------------------------------------------------------------------------
 *  Some memory integrity checks.
 */

function is_safe_proxy( proxy : Cell ) : boolean {
  /**/ return all_proxied_objects_by_id.has( proxy )
  //c/ return true;
}


function is_safe_reference( a : Cell ) : boolean {
  if( !is_safe_area( a ) )return false;
  return true;
}


function cell_looks_safe( c : Cell ) : boolean {
// Try to determine if a cell looks like a valid one

  const v = value( c );
  const i = info( c );
  const t = unpack_type( i );

  let referencee = v;
  let tag = v;

  switch( t ){

  case type_boolean :
    if( v != 0 && v != 1 ){
      bug( S()
        + "Invalid boolean value, " + N( v )
        + " at " + C( c )
      );
      return false;
    }
    return true;

  case type_text :
    if( !is_safe_proxy( referencee ) ){
      bug( S()
        + "Invalid proxy for text cell, " + C( referencee )
        + " at " + C( c)
      );
      debugger;
      return false;
    }
    // ToDo: check it is a text
    return true;

  case type_proxy :
    return is_safe_proxy( referencee );

  case type_reference :
    return is_safe_reference( referencee );

  case type_tag :
    if( ! is_valid_tag( tag ) ){
      bug( S()
        + "Invalid tag for cell, " + C( tag )
        + " at " + C( c )
      );
      return false;
    }
    return true;

  case type_integer :
    return true;

  case type_verb :
    // ToDo: check
    return true;

  case type_void :
    return true;

  default :
    bug( S()+ "Invalid type for cell" + N( t ) + " at " + C( c ) );
    return false;

  }
}


function cell_to_text( c : Cell ) : Text {

  alloc_de&&mand( cell_looks_safe( c ) );

  const v = value( c );
  const i = info(  c );
  const t = unpack_type( i );

  // ToDo: optimize with a switch?
  if( t == type_text ){
    return proxy_to_text( v );
  }else if( t == type_tag ){
    return tag_to_text( v );
  }else if( t == type_boolean ){
    /**/ return v ? "true" : no_text;
    //c/ return v ? Text( "true" ) : no_text;
  }else if( t == type_integer ){
    return integer_to_text( v );
  }else if( t == type_verb ){
    return no_text; // ToDo: return verb name if not anonymous?
  }else if( t == type_reference ){
    // ToDo: reenter the inner interpreter to call an as-text method?
    return no_text;
  }else if( t == type_void ){
    return no_text;
  }else{
    return no_text;
  }

}


/* ----------------------------------------------------------------------------
 *  Debug tool
 */


function is_a_tag_singleton( c : Cell ) : boolean {
  if( !is_a_tag_cell( c ) )return false;
  // xx:/xx magic marker
  return ( value( c ) == c || c == 0 );
}


// The header of each block of machine codes.
// ToDo: create a "definition" type?
const tag_block = tag( "block" );


function is_a_block_cell( c : Cell ) : boolean {
  return name( c ) == tag_block_header;
}


function is_a_verb_block( c : Cell ) : boolean {
// True when block is the definition of a verb vs inline code.
  return is_a_block_cell( c ) && !is_an_inline_block_cell( c );
}


function block_dump( ip : Cell ) : Text {
  de&&mand( is_a_block_cell( ip ) );
  const length = block_length( ip );
  let auto_buf = S();
  auto_buf += "Block " + C( ip ) + ", length " + N( length );
  // ToD: decode flags
  if( is_an_inline_block_cell( ip ) ){
    auto_buf += ", inline {}";
  }else{
    auto_buf += ", verb definition";
    if( is_immediate_verb( name( ip ) ) ){
      auto_buf += ", immediate";
    }
  }
  return auto_buf;
}


let cell_dump_entered = false;

function tag_to_dump_text( tag : Value ) : Text {
  if( tag == 0 ){
    return "invalid-0-tag";
  }else if( !is_valid_tag( tag ) ){
    return "invalid-tag-" + C( tag );
  }else{
    return tag_to_text( tag );
  }
}


function dump( c : Cell ) : Text {

  // Never dereference the cell at address 0
  if( c == 0 ){
    return "Invalid cell address 0";
  }

  // Detect recursive calls
  if( cell_dump_entered ){
    dump_invalid_cell = c;
    return "Error, reentered cell_dump( " + C( c ) + " )";
  }
  cell_dump_entered = true;

  const is_valid = cell_looks_safe( c );
  if( !is_valid ){
    dump_invalid_cell = c;
    debugger;
    cell_looks_safe(  c  );
  }

  let v = value( c );
  let i = info(  c );
  let t = unpack_type( i );
  let n = unpack_name( i );

  let class_name_tag = 0;

  /**/ let  buf = "";
  //c/ Text buf(  "" );
  /**/ let  txt = "";
  //c/ Text txt(  "" );

  switch( t ){

    case type_void :

      if( n == tag_dynamic_ref_count ){
        // Check integrity of busy dynamic area
        if( !is_safe_area( header_to_area( c ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid busy dynamic area, ";
        }else{
          cell_dump_entered = false;
          return "busy, count: " + N( v );
        }

      }else if( n == tag_dynamic_next_area ){
        // Check integrity of free dynamic area
        if( !is_safe_area( header_to_area( c ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid dynamic free area, ";
        }else{
          cell_dump_entered = false;
          return "free, next: " + C( v );
        }

      }else if( n == tag_dynamic_area_size ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c - ONE ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          if( is_busy_area( header_to_area( c - ONE ) )){
            let length = to_cell( v ) - 2;
            // 0 length is what proxied objects use in Typescript
            // 1 length is what proxied objects use in C++
            if(
              /**/ length == 0
              //c/ length == 1 && name( c + ONE ) == tag_c_string
            ){
              const proxy_id = c + ONE;
              /**/ const obj = proxied_object_by_id( proxy_id );
              /**/ const proxy_class_name = obj.constructor.name;
              //c/ Text proxy_class_name( "c_string" );
              buf += " - <PROXY-" + C( proxy_id ) + ">"
              + proxy_class_name + C( c ) + ">";
              if( teq( proxy_class_name, "String" )
              ||  teq( proxy_class_name, "c_string" )
              ){
                txt = proxy_to_text( proxy_id );
                if( tlen( txt ) == 0 ){
                  txt += "<empty>";
                  if( proxy_id != value( the_empty_text_cell ) ){
                    dump_invalid_cell = c;
                    txt += " - ERROR: not the_empty_text_cell";
                  }
                }
                if( tlen( txt ) > 31 ){
                  txt = tcut( txt, 31 ) + "..." + N( tlen( txt ) );
                }
                // ToDo: sanitize txt to remove control characters
                buf += " " + txt;
              }
              return buf;
            }else{
              return S()+ "busy, length: "
              + N( to_cell( v ) - 2  );
            }
          }else{
            return S()+ "free, size: " + N( v );
          }
        }

      }else if( n == tag_block ){
        // Block description often comes next
        // ToDo: check presence of block header
        if( is_a_block_cell( c + ONE ) ){
          cell_dump_entered = false;
          return S()+ "block definition";
        }
      }

      if( n != tag_void || v != 0 ){
        if( is_valid_tag( n ) ){
          buf += tag_to_text( n );
        }else{
          dump_invalid_cell = c;
          buf += "Invalid-tag-" + C( n );
        }
      }
      if( v == 0 ){
        // buf += ":<void>";
      }else{
        buf += ":<void:" + C( v ) + ">";
      }
    break;

    case type_boolean :
      if( n != tag_boolean ){
        buf += tag_to_dump_text( n ) + ":";
      }
      if( v == 0 || v == 1 ){
        buf += v ? "true" : "false";
      }else{
        dump_invalid_cell = c;
        buf += "Invalid-boolean-" + N( v );
      }
    break;

    case type_tag :
      if( n == v ){
        buf += "/" + tag_to_dump_text( n );
        if( is_a_tag_singleton( c ) ){
          buf += " - <SINGLETON>";
        }
      }else{
        buf += tag_to_dump_text( n ) + ":/" + tag_to_dump_text( v );
      }
    break;

    case type_integer :
      if( n == tag_block_header ){
        /**/ const block_dump_text = block_dump( c );
        //c/ Text  block_dump_text = block_dump( c );
        cell_dump_entered = false;
        return block_dump_text;
      }
      if( n != tag_integer ){
        buf += tag_to_dump_text( n ) + ":";
      }
      buf += integer_to_text( v );
    break;

    case type_reference :
      class_name_tag = name( v );
      buf += tag_to_dump_text( n )
      + "<" + tag_to_dump_text( class_name_tag ) + C( v ) + ">";
    break;

    case type_proxy :
      /**/ const obj = proxied_object_by_id( v );
      /**/ const proxy_class_name = obj.constructor.name;
      /**/ //c/ TxtC proxy_class_name( "c_string" );
      /**/ buf += tag_to_text( n )
      /**/ + "<proxied-" + proxy_class_name + C( v ) + ">";
    break;

    case type_text :
      txt = cell_to_text( c );
      // ToDo: truncate somewhere else
      if( tlen( txt ) > 31 ){
        txt = tcut( txt, 31 ) + "..." + N( tlen( txt ) );
      }
      if( n != tag_text ){
        buf += tag_to_dump_text( n )  + ":";
      }
      // ToDo: better escape
      // ToDo: C++ version
      /**/ txt = txt
      /**/ .replace( "\n",  () => "\\n"  )
      /**/ .replace( "\"",  () => "\\\"" )
      /**/ .replace( "\t",  () => "\\t"  )
      /**/ .replace( "\r",  () => "\\r"  )
      /**/ .replace( "\\",  () => "\\\\" )
      buf += "\"" + txt + "\"";
      if( c == the_empty_text_cell ){
        buf += " - <SINGLETON>";
      }else if( tlen( txt ) == 0 && v != 0 ){
        buf += " - <INVALID_EMPTY_TEXT>";
      }
    break;

    case type_verb :
      // ToDo: add name
      buf += tag_to_dump_text( n );
      if( v != 0 ){
        buf += ":<verb:" + N( v ) + ">";
      }
    break;

    case type_flow :
      // ToDo: add name
      buf += tag_to_dump_text( n ) + ":<flow:" + N( v ) + ">";
    break;

    default :
      de&&mand( false );
      dump_invalid_cell = c;
      buf += tag_to_dump_text( n )
      + ":<invalid type " + C( t ) + ":" + C( v ) + ">";
      breakpoint();
    break;

  }

  cell_dump_entered = false;

  if( blabla_de || dump_invalid_cell != 0 ){
    buf += "        ( " + N( t ) + "/" + N( n ) + "/" + N( v )
    + " " + type_to_text( t ) + " " + C( c )
    + ( is_valid ? " )" : " - INVALID )" );
  }
  return buf;

}


function short_dump( c : Cell ) : Text {

  // Detect recursive calls
  if( cell_dump_entered ){
    /**/ return "Error, reentered cell_short_dump( " + c + " )";
    //c/ return "Error, reentered cell_short_dump()";
  }
  cell_dump_entered = true;

  const is_valid = cell_looks_safe( c );
  if( !is_valid ){
    debugger;
    cell_looks_safe(  c  );
  }

  let v = value( c );
  let i = info(  c );
  let t = unpack_type( i );
  let n = unpack_name( i );

  let class_name_tag = 0;

  /**/ let  buf = "";
  //c/ Text buf(  "" );
  /**/ let  txt = "";
  //c/ Text txt(  "" );

  switch( t ){

    case type_void :
      if( n != tag_void || v != 0 ){
        buf += tag_to_dump_text( n );
      }
      if( v == 0 ){
        // buf += ":<void>";
      }else{
        buf += ":<void:" + C( v ) + ">";
      }
    break;

    case type_boolean :
      if( n != tag_boolean ){
        buf += tag_to_dump_text( n ) + ":";
      }
      buf += v ? "true" : "false";
    break;

    case type_tag :
      if( n == v ){
        buf += "/" + tag_to_dump_text( n );
      }else{
        buf += tag_to_dump_text( n ) + ":/" + tag_to_dump_text( v );
      }
    break;

    case type_integer :
      if( n != tag_integer ){
        buf += tag_to_dump_text( n ) + ":";
      }
      buf += integer_to_text( v );
    break;

    case type_reference :
      // ToDo: add class
      class_name_tag = name( v );
      buf += tag_to_dump_text( n )
      + "<" + tag_to_dump_text( class_name_tag ) + ">";
    break;

    case type_proxy :
      /**/ const obj = proxied_object_by_id( v );
      /**/ const proxy_class_name = obj.constructor.name;
      /**/ //c/ Text proxy_class_name( "c_string" );
      /**/ buf += tag_to_dump_text( n )
      /**/ + "<proxied-" + proxy_class_name + C( v ) + ">";
    break;

    case type_text :
      txt = cell_to_text( c );
      // ToDo: truncate somewhere else
      if( tlen( txt ) > 31 ){
        txt = tcut( txt, 31 ) + "..." + N( tlen( txt ) );
      }
      if( n != tag_text ){
        buf += tag_to_dump_text( n )  + ":";
      }
      // ToDo: better escape
      /**/ txt = txt
      /**/ .replace( "\n",  () => "\\n"  )
      /**/ .replace( "\"",  () => "\\\"" )
      /**/ .replace( "\t",  () => "\\t"  )
      /**/ .replace( "\r",  () => "\\r"  )
      /**/ .replace( "\\",  () => "\\\\" )
      buf += "\"" + txt + "\"";
    break;

    case type_verb :
      buf += "#" + tag_to_dump_text( n ) + "#";
      if( v != 0 ){
        buf += ":<verb:" + C( v ) + ">";
      }
    break;

    case type_flow :
      // ToDo: add name
      buf += tag_to_dump_text( n ) + ":<flow:" + N( v ) + ">";
    break;

    default :
      de&&mand( false );
      buf += tag_to_dump_text( n )
      + ":<invalid-type " + C( t ) + ":" + C( v ) + ">";
      breakpoint();
    break;

  }

  cell_dump_entered = false;

  return buf;

}


function stacks_dump() : Text {
// Returns a text dump of the cells of the data and control stacks, stack trace

  const tos = TOS;
  const csp = CSP;

  /**/ let  buf = "\nDATA STACK:";
  //c/ Text buf(  "\nDATA STACK:" );
  let ptr  = tos;

  let some_dirty = false;

  // Checks that cells that were at the top of the stack were correctly cleared
  if( value( ptr + 2 * ONE ) != 0 ){
    buf += "\n-2 DIRTY -> " + dump( ptr + 2 * ONE );
    some_dirty = true;
  }
  if( value( ptr + ONE ) != 0 ){
    buf += "\n-1 DIRTY -> " + dump( ptr + 1 * ONE );
    some_dirty = true;
  }

  let base = ACTOR_data_stack;

  if( ptr < base ){
    buf += "\nData stack underflow, top " + N( tos )
    + ", base "       + C( base )
    + ", delta "      + N( tos - base )
    + ", excess pop " + N( ( tos - base ) / ONE );
    // base = ptr + 5 * ONE;
    some_dirty = true;
  }

  let nn = 0;
  while( ptr >= base ){
    buf += "\n"
    + N( nn ) + " -> "
    + dump( ptr )
    + ( ptr == ACTOR_data_stack ? " <= BASE" : "" );
    if( ptr == ACTOR_data_stack )break;
    ptr -= ONE;
    nn++;
    if( nn > 10 ){
      buf += "...";
      break;
    }
  }

  buf += "\nCONTROL STACK: ";
  ptr = csp;

  if( value( ptr + 2 * ONE ) != 0 ){
    buf += "\n-2 DIRTY -> " + dump( ptr + 2 * ONE );    some_dirty = true;
  }
  if( value( ptr + 1 * ONE ) != 0 ){
    buf += "\n-1 DIRTY -> " + dump( ptr + 1 * ONE );    some_dirty = true;
  }

  let return_base = ACTOR_control_stack;

  if( ptr < return_base ){
    buf += "\nControl stack underflow, top " + C( csp )
    + ", base "       + C( return_base )
    + ", delta "      + N(   csp - return_base )
    + ", excess pop " + N( ( csp - return_base ) / ONE );
    // ToDo: fatal error?
    some_dirty = true;
    // return_base = ptr + 5 * ONE;
  }

  nn = 0;
  while( ptr >= return_base ){
    buf += "\n"
    + N( nn ) + " -> "
    + dump( ptr )
    + ( ptr == ACTOR_control_stack ? " <= BASE" : "" );
    if( nn > 10 ){
      buf += "...";
      break;
    }
    ptr -= ONE;
    nn++;
  }

  if( stack_de && some_dirty ){
    bug( buf );
    debugger;
  }

  return buf;

}


/*
 *  debugger primitive - invoke host debugger, if any
 */

function primitive_debugger(){
  debugger;
}
primitive( "debugger", primitive_debugger );


/*
 *  debug primitive - activate lots of traces
 */

function primitive_debug(){
  debug();
}
primitive( "debug", primitive_debug );


/*
 *  no-debug primitive - deactivate lots of traces
 */

function primitive_no_debug(){
  no_debug();
}
primitive( "no-debug", primitive_no_debug );


/*
 *  log primitive -
 */

function primitive_log(){

  const verb_cell = POP();
  const typ = type( verb_cell );

  if( typ == type_tag ){

    const verb = value( verb_cell );

    if( verb == tag( "do-not" ) ){
      can_log = false;
    }

    if( verb == tag( "do" ) ){
      can_log = true;
    }

    /**/ bug = can_log ? console.log : trace;

    if( verb == tag( "enable" ) ){
      const domain_cell = POP();
      const domain_id = value( domain_cell );
      if( domain_id == tag( "eval" ) ){
        /**/ eval_de = true;
        /*c{
          #ifndef eval_de
            eval_de = true;
          #endif
        }*/
      }
      if( domain_id == tag( "step" ) ){
        /**/ step_de = true;
        /*c{
          #ifndef step_de
            step_de = true;
          #endif
        }*/
      }
      if( domain_id == tag( "run" ) ){
        /**/ run_de = true;
        /*c{
          #ifndef run_de
            run_de = true;
          #endif
        }*/
      }
      if( domain_id == tag( "stack" ) ){
        /**/ stack_de = true;
        /*c{
          #ifndef stack_de
            stack_de = true;
          #endif
        }*/
      }
      if( domain_id == tag( "token" ) ){
        /**/ token_de = true;
        /*c{
          #ifndef token_de
            token_de = true;
          #endif
        }*/
      }
      clear( domain_cell );

    }else if( verb == tag( "disable" ) ){
      const domain_cell = POP();
      const domain_id = value( domain_cell );
      if( domain_id == tag( "eval" ) ){
        /**/ eval_de = false;
        /*c{
          #ifdef eval_de
            eval_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "step" ) ){
        /**/ step_de = false;
        /*c{
          #ifdef step_de
            step_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "run" ) ){
        /**/ run_de = false;
        /*c{
          #ifdef run_de
            run_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "stack" ) ){
        /**/ stack_de = false;
        /*c{
          #ifdef stack_de
            stack_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "token" ) ){
        /**/ token_de = false;
        /*c{
          #ifdef token_de
            token_de = false;
          #endif
        }*/
      }
      clear( domain_cell );
    }
  }
  clear( verb_cell );
}
primitive( "log", primitive_log );


/*
 *  fast! primitive - Switch to "fast mode", return previous state
 */

const tag_is_fast = tag( "fast?" );

function primitive_set_fast(){
  // ToDo: per actor?
  check_de&&mand_boolean( TOS );
  const was_turbo = de;
  if( value( TOS ) ){
    no_debug_at_all();
  }else{
    no_debug();
  }
  set_value( TOS, was_turbo ? 1 : 0 );
  set_tos_name( tag_is_fast );
}
primitive( "fast!", primitive_set_fast );


/*
 *  fast? primitive - Return current state for "fast mode"
 */

function primitive_is_fast(){
  push_boolean( de || check_de ? false : true );
  set_tos_name( tag_is_fast );
}
primitive( "fast?", primitive_is_fast );


/*
 *  noop primitive - No operation - does nothing
 */

function save_ip( label : Tag ){
  CSP += ONE;
  set( CSP, type_integer, label, IP );
}

function primitive_noop(){
}
primitive( "noop", primitive_noop );


/*
 *  assert-checker primitive - internal
 */

function primitive_assert_checker(){

// This primitive gets called after an assertion block has been executed.

  // Expect assertions to provide a boolean result!
  mand_boolean( TOS );

  // If the assertion failed, fatal error is raised
  if( pop_raw_value() == 0 ){
    FATAL( "Assertion failed" );
    return;
  }

  // Return to where assert was called
  IP = eat_integer( CSP );
  CSP -= ONE;

}
primitive( "assert-checker", primitive_assert_checker );


const tag_assert_checker = tag( "assert-checker" );

// Cannot init now in C++, see init_globals();
let assert_checker_definition = 0;
// = definition( tag_assert_checker );


/*
 *  assert primitive - assert a condition, based on the result of a block
 */

const tag_assert = tag( "assert" );

function  primitive_assert(){

// Assert that a condition is true, based on the result of a block

  // Do not execute the assertion block, if fast mode is on
  if( !de ){
    pop_raw_value();
    return;
  }

  check_de&&mand_block( TOS );

  // Save return address
  save_ip( tag_assert );

  // Insert assertion checker so that block will return to it
  CSP += ONE;
  set( CSP, type_integer, tag_assert_checker, assert_checker_definition );

  // Jump into block definition, on return it will run the assertion checker
  IP = pop_raw_value();

}
primitive( "assert", primitive_assert );


/* -----------------------------------------------------------------------------
 *  Low level access to values, their packed type and name.
*/

const tag_type  = tag( "type"   );
const tag_name  = tag( "name"   );
const tag_value = tag( "value"  );
const tag_info  = tag( "info"   );

const pack_void      = pack( type_void,       tag_void      );
const pack_tag       = pack( type_tag,        tag_tag       );
const pack_integer   = pack( type_integer,    tag_integer   );
const pack_text      = pack( type_text,       tag_text      );
const pack_reference = pack( type_reference,  tag_reference );
const pack_proxy     = pack( type_proxy,      tag_proxy     );
const pack_verb      = pack( type_verb,       tag_verb      );


function primitive_type(){
// Get type as a tag
  const tag = type_to_tag( type( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_type, tag );
}
primitive( "type", primitive_type );


function primitive_name(){
// Get name as a tag
  const n = name( TOS );
  clear( TOS );
  set( TOS, type_tag, tag_name, n );
}
primitive( "name", primitive_name );


function primitive_value(){
// Get value as an integer
  let v = value( TOS );
  clear( TOS );
  set( TOS, type_integer, tag_value, v );
}
primitive( "value", primitive_value );


function primitive_info(){
// Get info as an integer, see pack-info
  let i = info( TOS );
  clear(   TOS );
  set(     TOS, type_integer, tag_info, i );
}
primitive( "info", primitive_info );


function primitive_pack_info(){
// Pack type and name into an integer, see unpack-type and unpack-name
  const name_cell = POP();
  const type_cell = TOS;
  const type_id = tag_to_type( value( type_cell ) );
  de&&mand( type_id != type_invalid );
  const info = pack( type_tag, value( name_cell ) );
  clear( type_cell );
  clear( name_cell );
  init_cell(  TOS, info, pack( type_integer, tag_info ) );
}
primitive( "pack-info", primitive_pack_info );


function primitive_unpack_type(){
// Unpack type from an integer, see pack-info
  const info    = value( TOS );
  const typ     = unpack_type( info );
  const typ_tag = type_to_tag( typ );
  clear( TOS );
  init_cell( TOS, typ_tag, pack( type_tag, tag_type ) );
}
primitive( "unpack-type", primitive_unpack_type );


function primitive_unpack_name(){
// Unpack name from an integer, see pack-info
  const info = value( TOS );
  const name = unpack_name( info );
  clear( TOS );
  init_cell(  TOS, name, pack( type_tag, tag_name ) );
}
primitive( "unpack-name", primitive_unpack_name );


/* ---------------------------------------------------------------------------
 *  Some type checking. They work only when the global "de" flag is set.
 *  This is true if the interpreter was compiled in so called debug or
 *  development mode. Once a program is considered deployable, it is usually
 *  run by a runtime that does not provide most of the facilities that
 *  are available in debug/development mode, for speed reasons and compactness.
 */

function type_to_text( type_id : Index ) : Text {
// Convert a type id, 0..15, into a text.
  if( type_id < 0 || type_id >= type_invalid ){
    return "invalid";
  }
  return all_symbol_texts[ type_id ];
}


function type_to_tag( type_id : Index ) : Tag {
// Convert a type id, 0..15, into it's tag.
  if( type_id < 0 || type_id >= type_invalid )return tag_invalid;
  if( type_id == type_void )return tag_void;
  return type_id;
}


function tag_to_type( tag : Tag ) : Type {
// Convert a tag into a type id
  if( tag == tag_void    )return 0;
  if( tag < type_invalid )return tag;
  return type_invalid;
}


function type_name_to_type( n : Text ) : Type {
// Convert a type text name into a type id in range 0..9 where 9 is invalid
  const idx = symbol_lookup( n );
  if( idx > type_invalid )return type_invalid;
  return idx;
}


function cell_class_tag( c : Cell ) : Tag {
// Get the most specific type of a cell's value
  const t = type( c );
  // For references, it's the name stored in the first cell of the object
  if( t == type_reference ){
    return name( value( c ) );
  }
  // For proxied object, it's the class name of the proxied object
  if( t == type_proxy ){
    //c/ return tag_c_string;
    /**/ const proxied_obj = proxied_object_by_id( value( c ) );
    /**/ const js_type = typeof proxied_obj;
    /**/ if( typeof proxied_obj == "object" ){
    /**/   return tag( proxied_obj.constructor.name );
    /**/ }
    /**/ return tag( js_type );
  }
  return type_to_tag( type( c ) );
}

/*
 *  class primitive - Get the most specific type name (as a tag)
 */

const tag_class = tag( "class" );

function primitive_inox_class(){
  const class_tag = cell_class_tag( TOS );
  clear( TOS );
  set( TOS, type_tag, tag_class, class_tag );
}
primitive( "class", primitive_inox_class );


/* ---------------------------------------------------------------------------
 *  Some ...
 */

const tag_if = tag( "if" );

function primitive_if(){
// Run block if boolean is true
  const block = pop_block();
  if( pop_boolean() == 0 ){
    return;
  }
  // Push return address
  save_ip( tag_if );
  // Jump into block
  IP = block;
}
primitive( "if", primitive_if );


const tag_if_not = tag( "if-not" );

function primitive_if_not(){
  // Run block if boolean is true
  const block = pop_block();
  if( pop_boolean() != 0 )return;
  // Push return address
  save_ip( tag_if_not );
  // Jump into block
  IP = block;
}
primitive( "if-not", primitive_if_not );


function primitive_if_else(){
// Run one of two blocks  ( bool then-block else-block -- block )
  const else_block = pop_block();
  const then_block = pop_block();
  if( eat_boolean( TOS ) != 0 ){
    set( TOS, type_integer, tag_block, then_block );
    reset( else_block );
  }else{
    set( TOS, type_integer, tag_block, else_block );
    reset( then_block );
  }
  primitive_run();
}
primitive( "if-else", primitive_if_else );


/*
 *  >R, R>, R@, Forth style
 */

function  primitive_to_control(){
  // >R in Forth
  CSP += ONE;
  move_cell( POP(), CSP );
}
primitive( "to-control", primitive_to_control );


function primitive_from_control(){
  // R> in Forth
  move_cell( CSP, PUSH() );
  CSP -= ONE;
}
primitive( "from-control", primitive_from_control );


function primitive_fetch_control(){
  // R@ in Forth
  copy_cell( CSP, PUSH() );
}
primitive( "fetch-control", primitive_fetch_control );


/*
 *  while primitive
 */

const tag_while_2         = tag( "while-2" );
const tag_while_3         = tag( "while-3" );
const tag_goto_while_2    = tag( "goto-while-2" );
const tag_goto_while_3    = tag( "goto-while-3" );
const tag_while_body      = tag( "while-body" );
const tag_while_condition = tag( "while-condition" );
const tag_break_sentinel  = tag( "break-sentinel" );
const tag_loop_body       = tag( "loop-body" );
const tag_loop_until_2    = tag( "loop-until-2" );
const tag_loop_condition  = tag( "while-condition" );
const tag_goto_loop_2     = tag( "goto-loop-2" );
const tag_goto_loop_3     = tag( "goto-loop-3" );
const tag_looo_while      = tag( "loop-while" );


function primitive_while_1(){
// Low level verbs to build while( { condition } { body } )
  // : while
  //   while-1 ( save blocks in control stack )
  //   while-2 ( run condition block )
  //   while-3 ( if condition ok, run body & jump to while-2 )
  // . inline
  const body_block      = pop_block();
  const condition_block = pop_block();
  // IP is expected to points to while-2
  de&&mand_eq( name( IP ), tag_while_2 );
  // Save info for break-loop, it would skip to after while-3
  CSP += ONE;
  set( CSP, type_integer, tag_break_sentinel, IP + 2 * ONE );
  // Remember body and condition in control stack
  CSP += ONE;
  set( CSP, type_integer, tag_while_body, body_block );
  CSP += ONE;
  set( CSP, type_integer, tag_while_condition, condition_block );
  // The control stack now holds:
  //   IP for break, named loop-sentinel
  //   IP for the body block
  //   IP for the condition block
  // Execution continues inside while-2
}
primitive( "while-1", primitive_while_1 );


function primitive_while_2(){
  // IP is expected to point to while-3
  de&&mand_eq( name( IP ), tag_while_3 );
  const condition_block = value( CSP );
  // Invoke condition, like run would do
  CSP += ONE;
  set( CSP, type_integer, tag_goto_while_3, IP );
  // Jump into block
  IP = condition_block;
  // The control stack now holds:
  //   IP for break, named break-sentinel
  //   IP for the body block, named /while-body in debug mode
  //   IP for the condition block, named /while-condition in debug mode
  //   IP address of while-3, the condition block will return to it
}
primitive( "while-2", primitive_while_2 );


function primitive_while_3(){

  let flag = pop_boolean();

  // If the condition is met, run the body and loop
  if( flag != 0 ){
    const body_block = value( CSP - ONE );
    // The return of the body block must jump to while-2
    CSP += ONE;
    // ip currently points after this primitive, hence while-2 is before
    set( CSP, type_integer, tag_goto_while_2, IP - 2 * ONE );
    // CSP must now point to while-2 primitive verb
    de&&mand_eq( name( value( CSP ) ), tag_while_2 );
    // Jump into the body block
    IP = body_block;

  // The while condition is not met, it's time to exit the loop
  }else{
    // Drop break sentinel, condition and body from control stack
    // ToDo: use lookup instead of fixed value if optimistic guess failed.
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    de&&mand_eq( name( CSP - 2 * ONE ), tag_break_sentinel );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
  }
}
primitive( "while-3", primitive_while_3 );


function primitive_until_3(){
// Like while loop but with the boolean reversed
  if( value( TOS ) == 0 ){
    set_value( TOS, 1 );
  }else{
    set_value( TOS, 0 );
  }
  primitive_while_3();
}
primitive( "until-3", primitive_until_3 );


/*
 *  loop primitive
 */

function primitive_loop(){
  const body_block = pop_block();
  // Save info for break-loop, it would skip to after loop
  CSP += ONE;
  set( CSP, type_integer, tag_break_sentinel, IP );
  // Invoke body block, it will return to itself, loopimg until some break
  CSP += ONE;
  set( CSP, type_integer, tag_break_sentinel, body_block );
  // Jump into boby block
  IP = body_block;
}
primitive( "loop", primitive_loop );


function lookup_sentinel( csp : Cell, tag : Tag ) : Cell {
  let next_csp = csp - ONE;
  // Drop anything until sentinel
  while( next_csp >= ACTOR_control_stack ){
    // ToDo: test type against Act boundary
    if( name( next_csp ) == tag )return next_csp;
    next_csp -= ONE;
  }
  return 0;
}


/*
 *  break primitive
 */


function primitive_break(){
// Like return but to exit a control structure, a non local return
  let sentinel_csp = lookup_sentinel( CSP, tag_break_sentinel );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL( "break sentinel is missing" );
    return;
  }
  // Return to IP previously saved in break sentinel
  IP = value( sentinel_csp );
  // Clear control stack down to sentinel included
  while( CSP >= sentinel_csp ){
    clear( CSP );
    CSP -= ONE;
  }
}
primitive( "break", primitive_break );


/*
 *  sentinel primitive
 */

function primitive_sentinel(){
  const sentinel_name = pop_tag();
  CSP += ONE;
  set( CSP, type_integer, sentinel_name, IP );
}
primitive( "sentinel", primitive_sentinel );


/*
 *  long jump primitive
 */


function primitive_long_jump(){
// Non local return up to some sentinel set using sentinel
  const sentinel_name = pop_tag();
  const sentinel_csp = lookup_sentinel( CSP, sentinel_name );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL(
      "jump, missing sentinel " + tag_to_text( sentinel_name )
    );
    return;
  }
  // The sentinel holds a valid return address
  IP = eat_integer( CSP );
  // Clear control stack up to sentinel included
  while( CSP >= sentinel_csp ){
    clear( CSP );
    CSP -= ONE;
  }
}
primitive( "long-jump", primitive_long_jump );


/*
 *  loop-until primitive
 */

const tag_loop_until    = tag( "loop-until" );
const tag_until_checker = tag( "until-checker" );

// ToDo: C++ cannot get definitions now, see init_globals()
let until_checker_definition = 0;
// = definition( tag_until_checker );


function primitive_until_checker(){
  const flag = pop_boolean();
  if( flag == 0 ){
    const body_block = value( CSP );
    CSP -= ONE;
    const condition_block = value( CSP );
    CSP += ONE;
    set( CSP, type_integer, tag_loop_until, until_checker_definition );
    CSP += ONE;
    set( CSP, type_integer, tag_loop_condition, condition_block );
    IP = body_block;
  }else{
    // Drop loop sentinel, condition and body from control stack
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
    IP = value( CSP );
    CSP -= ONE;
  }
}
primitive( "until-checker", primitive_until_checker );


const tag_while_checker   = tag( "while-checker" );

// C++ cannot get definitions now, see init_globals()
let while_checker_definition = 0;
// = definition( tag_while_checker );


function primitive_while_checker(){
  const flag = pop_boolean();
  if( flag == 0 ){
    const body_block = value( CSP );
    CSP -= ONE;
    const condition_block = value( CSP );
    CSP += ONE;
    set( CSP, type_integer, tag_loop_until, while_checker_definition );
    CSP += ONE;
    set( CSP, type_integer, tag_loop_condition, condition_block );
    IP = body_block;
  }else{
    // Drop loop sentinel, condition and body from control stack
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
    IP = value( CSP );
    CSP -= ONE;
  }
}
primitive( "while-checker", primitive_while_checker );


function primitive_loop_until(){
  debug();
  const condition_block = pop_block();
  const body_block      = pop_block();
  CSP += ONE;
  set( CSP, type_integer, tag_break_sentinel, IP );
  CSP += ONE;
  set( CSP, type_integer, tag_loop_condition, condition_block );
  CSP += ONE;
  set( CSP, type_integer, tag_loop_body, body_block );
  CSP += ONE;
  set( CSP, type_integer, tag_until_checker, until_checker_definition );
  CSP += ONE;
  set( CSP, type_integer, tag_loop_condition, condition_block );
  IP = body_block;
}
primitive( "loop-until", primitive_loop_until );


/*
 *  loop-while primitive
 */

function primitive_loop_while(){
  const condition_block = pop_block();
  const body_block      = pop_block();
  CSP += ONE;
  set( CSP, type_integer, tag_break_sentinel, IP );
  CSP += ONE;
  set( CSP, type_integer, tag_loop_condition, condition_block );
  CSP += ONE;
  set( CSP, type_integer, tag_loop_body, body_block );
  CSP += ONE;
  set( CSP, type_integer, tag_until_checker, while_checker_definition );
  CSP += ONE;
  set( CSP, type_integer, tag_loop_condition, condition_block );
  IP = body_block;
}
primitive( "loop-while", primitive_loop_while );


/* -----------------------------------------------------------------------------
 *  Polymorphic methods.
 */

const tag_missing_method   = tag( "missing-method"   );
const tag_missing_verb     = tag( "missing-verb"     );
const tag_missing_operator = tag( "missing-operator" );

// Not on metal
/*!c{*/

function dispatch_binary_operator(
  operator_tag : Index,
  target_type  : Index
) : void {

  const tos = TOS;
  const target = tos + ONE;

  const target_class_name = !is_a_reference_type( target_type )
  ? type_to_text( target_type )
  : tag_to_text( name( target ) );

  const full_name = target_class_name + "." + tag_to_text( operator_tag );

  let verb_id = tag( full_name );
  if( verb_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( verb_id == 0 ){
      // ToDo: lookup based on type, unless reference
      if( target_type != type_reference ){
        // ToDo: get type as text, then add : and method name
      }
      if( verb_id == 0 ){
        push_text( full_name );
        verb_id = tag_missing_operator;
      }
    }
  }

  CSP += ONE;
  set( CSP, type_integer, verb_id, IP );
  IP = definition( verb_id );

}

// Arithmetic works on integers but also on the values of void & tag types
const all_integer_like_type_tags = [
  tag_void,
  tag_tag,
  tag_integer
];

type UnaryOperatorFunction  = ( p : Value ) => Value;
type BinaryOperatorFunction = ( a : Value, b : Value ) => Value;

// Maps integer.+ to some BinaryOperatorFunction, for all operators
const all_binary_operator_functions_by_tag
= new Map< Name, BinaryOperatorFunction >;

// Maps integer.not? to some UnaryOperatorFunction, for all operators
const all_unary_operator_functions_by_tag
= new Map< Name, UnaryOperatorFunction >;


function verb_id_by_type_and_verb( t : Tag, n : Tag ) : Index {
  const fullname = tag_to_text( t ) + "." + tag_to_text( n );
  return tag( fullname );
}


function define_class_binary_operator_primitive(
  t : Type,
  n : Tag,
  fun : BinaryOperatorFunction
){

  const target_type = t;
  const operator_name = n;

  const primitive_name
  = tag_to_text( target_type ) + "." + tag_to_text( operator_name );

  // For reference types
  if( is_a_reference_type( target_type ) ){


  // For not reference types, including integer
  }else{

    const tos = TOS;
    const target = tos + ONE;

    let verb_id = verb_id_by_type_and_verb(
      target_type,
      operator_name
    );
    if( verb_id == 0 ){
      // ToDo: lookup in class hierarchy
      // ToDo: on the fly creation of the target method if found
      if( verb_id == 0 ){
        push_text( primitive_name );
        verb_id = tag( "operator-missing" );
      }
    }
    CSP += ONE;
    set( CSP, type_integer, verb_id, IP );
    IP = definition( verb_id );
  }

}


function define_overloaded_binary_operator_primitives(
  n : Text,
  fun : BinaryOperatorFunction
){

  let class_name : Tag;

  for( class_name of all_integer_like_type_tags ){
    define_class_binary_operator_primitive(
      class_name,
      tag( n ),
      fun
    );
  };

}

/*}*/


/*
 *  + operator primitive
 */

function primitive_add(){

  const target_type = type( TOS - ONE );

  if( is_a_reference_type( target_type ) ){
    // Polymorphic case, with operator overloading
    //c/ bug( "ToDo: polymorphic operator" );
    /**/ dispatch_binary_operator( tag( "+" ), target_type );
    return;
  }

  push_integer( pop_integer() + pop_integer() );

}
operator_primitive( "+", primitive_add );


/*
 *  =? - value equality
 */

const tag_is_equal = tag( "=?" );

function primitive_is_equal(){

  const p2 = POP();
  const p1 = TOS;
  const value1 = value( p1 );
  const value2 = value( p2 );
  const type1  = type(  p1 );
  const type2  = type(  p2 );

  // Simple case if when both type and value are the same
  if( type1 == type2 ){
    if( value1 == value2 ){
      clear( p2 );
      clear( p1 );
      set( p1, type_boolean, tag_is_equal, 1 );
      return;
    }
    // If not references, then they're necesseraly different
    if( !needs_clear( p1 ) ){
      clear( p2 );
      clear( p1 );
      set( p1, type_boolean, tag_is_equal, 0 );
      return;
    }
    // For text, compare content
    if( type1 == type_text  ){
      /**/ const text1 = cell_proxied_object( p1 );
      /**/ const text2 = cell_proxied_object( p2 );
      //c/ const char* text1 = (const char*) value( value( p1 ) );
      //c/ const char* text2 = (const char*) value( value( p2 ) );
      let is_it = 0;
      // If same content
      if( text2 == text1 ){
        is_it = 1;
      }else{
        /*c{
          if( strcmp( text1, text2 ) == 0 ){
            is_it = 1;
          }
        }*/
      }
      clear( p2 );
      clear( p1 );
      set( p1, type_boolean, tag_is_equal, is_it );
      return;
    }
    // p1 is an object or a proxied object
    // ToDo: delegate to p1
    clear( p1 );
    clear( p2 );
    set( p1, type_boolean, tag_is_equal, 0 );
    return;
  }

  // It's getting complex, let's delegate to the first operand if possible
  if( type1 != type_reference ){
    clear( p1 );
    clear( p2 );
    set( p1, type_boolean, tag_is_equal, 0 );
    return;
  }

  // ToDo: p1 is a reference, let's delegate to the object it points to
  clear( p1 );
  clear( p2 );
  set( p1, type_boolean, tag_is_equal, 0 );

}
operator_primitive( "=?", primitive_is_equal );


/*
 *  <>? - value inequality, the boolean opposite of =? value equality.
 */

function primitive_is_not_equal(){
  primitive_is_equal();
  set_value( TOS, value( TOS ) == 0 ? 1 : 0 );
}
operator_primitive( "<>?", primitive_is_not_equal );


/*
 *  ==? - object identicallity, ie shallow equality, not deep equality.
 */

function primitive_is_identical(){

  const p2     = POP();
  const p1     = TOS;
  const value1 = value( p1 );
  const value2 = value( p2 );
  const type1  = type(  p1 );
  const type2  = type(  p2 );

  clear( p2 );
  clear( p1 );

  // Simple case if when both type and value are the same
  if( value1 == value2 && type1 == type2 ){
    set_value( p1, 1 );
  }else{
    set_value( p1, 0 );
  }

}
operator_primitive( "==?", primitive_is_identical );


/*
 *  not==? - object inquality, boolean opposite of ==? shallow equality.
 */

function primitive_is_not_identical(){
  primitive_is_identical();
  set_value( TOS, value( TOS ) == 0 ? 1 : 0 );
}
operator_primitive( "not==?", primitive_is_not_identical );


/*
 *  Generic solution for arithmetic operators
 */

/**/ function binary_math_operator( n : Text, fun : Function ) : void {
/**/ // Build an operator primitive. ToDo: Also built integer.xx, float.xx
/**/   operator_primitive(
/**/      n,
/**/      function primitive_binary_operator(){
/**/        const p2 = POP();
/**/        const p1 = TOS;
/**/        if( check_de ){
/**/          if( type( p2 ) != type_integer ){
/**/            clear( p2 );
/**/            bug( "bad type, expecting integer second operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/          if( type( p1 ) != type_integer ){
/**/            bug( "bad type, expecting integer first operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/        }
/**/        const r = fun( value( p1 ), eat_raw_value( p2 ) );
/**/        set_value( p1, r );
/**/      }
/**/    );
/**/  }


/**/  function binary_boolean_operator( n : Text, fun : Function ) : void {
/**/  // Build an boolean operator primitive. Also built boolean.
/**/    operator_primitive(
/**/      n,
/**/      function primitive_binary_boolean_operator(){
/**/        const p2 = POP();
/**/        const p1 = TOS;
/**/        if( check_de ){
/**/          if( type( p2 ) != type_boolean ){
/**/            clear( p2 );
/**/            bug( "bad type, expecting boolean second operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/          if( type( p1 ) != type_boolean ){
/**/            bug( "bad type, expecting boolean first operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/        }
/**/        const r = fun( value( p1 ), eat_raw_value( p2 ) );
/**/        set_value( p1, r );
/**/      }
/**/    );
/**/  }


/*
 *  Generic solution for arithmetic operators
 */

/*!c{*/

binary_math_operator( "-",     ( a, b ) => a -   b );
binary_math_operator( "*",     ( a, b ) => a *   b ); // multiply
binary_math_operator( "/",     ( a, b ) => a /   b ); // ToDo: division by zero
binary_math_operator( "%",     ( a, b ) => a %   b ); // remainder
// ToDo: /%, // floor division and %% “dividend dependent modulo”, see CoffeeScript
binary_math_operator( "**",    ( a, b ) => a **  b ); // exponentation

binary_math_operator( "<<",    ( a, b ) => a <<  b ); // left binary shift
binary_math_operator( ">>",    ( a, b ) => a >>  b ); // right binary shift
//binary_math_operator( ">>>",   ( a, b ) => a >>> b ); // idem but with 0 highest bit
binary_math_operator( "AND",   ( a, b ) => a &   b ); // binary and
binary_math_operator( "OR",    ( a, b ) => a |   b ); // binary or
binary_math_operator( "XOR",   ( a, b ) => a ^   b ); // binary xor

/*}{

void check_int_parameters( int* a, int* b ){
  const p2 = POP();
  const p1 = TOS;
  if( check_de ){
    if( type( p2 ) != type_integer ){
      bug( "bad type, expecting integer second operand" );
      assert( false );
      return;
    }
    if( type( p1 ) != type_integer ){
      bug( "bad type, expecting integer first operand" );
      assert( false );
      return;
    }
  }
  *a = value( p1 );
  *b = eat_raw_value( p2 );
}

void checked_int_minus( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a - b );
}

void checked_int_multiply( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a * b );
}

void checked_int_divide( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a / b );
}

void checked_int_modulo( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a % b );
}

void checked_int_power( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, (Value) pow( a, b ) );
}

void checked_int_left_shift( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a << b );
}

void checked_int_right_shift( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a >> b );
}

void checked_int_and( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a & b );
}

void checked_int_or( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a | b );
}

void checked_int_xor( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a ^ b );
}


operator_primitive( "-",     checked_int_minus );
operator_primitive( "*",     checked_int_multiply );
operator_primitive( "/",     checked_int_divide );
operator_primitive( "%",     checked_int_modulo );
operator_primitive( "**",    checked_int_power );
operator_primitive( "<<",    checked_int_left_shift );
operator_primitive( ">>",    checked_int_right_shift );
operator_primitive( "AND",   checked_int_and );
operator_primitive( "OR",    checked_int_or );
operator_primitive( "XOR",   checked_int_xor );

}*/


/*
 *  Generic solution for arithmetic and boolean operators
 */

/*!c{*/

function unary_math_operator( n : Text, fun : Function ) : void {
  operator_primitive( n, function primitive_unary_operator(){
    const p0 = TOS;
    const r  = fun( value( p0 ) );
    de&&mand( r == 0 || r == 1 );
    set_value( p0, r );
    set_type( p0, type_integer )
  } );
 }


/**/ function unary_boolean_operator( n : Text, fun : Function ) : void {
/**/   operator_primitive( n, function primitive_unary_boolean_operator(){
/**/     const p0 = TOS;
/**/     const r  = fun( value( p0 ) );
/**/     de&&mand( r == 0 || r == 1 );
/**/     set_value( p0, r );
/**/     set_type( p0, type_boolean );
/**/   } );
/**/ }


 /*c*/


/*
 *  ? operator
 */

const tag_is_truthy = tag( "truthy?" );

function primitive_is_truthy(){

  const typ = type( TOS );

  switch( typ ){

    case type_void:
      de&&mand_eq( value( TOS ), 0 );
    break;

    case type_boolean:
      de&&mand( value( TOS ) == 0 || value( TOS ) == 1 );
    break;

    case type_integer:
      if( value( TOS ) != 0 ){
        set_value( TOS, 1 );
      }else{
        // not needed: set_value( TOS, 0 );
      }
    break;

    case type_reference:
      if( value( TOS ) != 0 ){
        clear( TOS );
        set_value(  TOS, 1 );
      }
    break;

    case type_proxy:
      clear( TOS );
    break;

    case type_text:
      if( value( TOS ) != 0 ){
        let is_empty;
        /**/ proxied_object_by_id( value( TOS ) ).length == 0;
        //c/ is_empty = *(char*) value( TOS ) == 0;
        if( is_empty ){
          clear( TOS );
          set_value(  TOS, 1 );
        }else{
          clear( TOS );
          set_value(  TOS, 0 );
        }
      }
    break;

    default:
      bug( "bad type, expecting boolean, integer, reference or text" );
      debugger;
      clear( TOS );
      set_value(  TOS, 0 );
    break;

  }
  set_type( TOS, type_boolean );
  set_tos_name( tag_is_truthy );
}
primitive( "truthy?", primitive_is_truthy );

operator_primitive( "?", primitive_is_truthy );


/*
 *  something? operator
 */

function primitive_is_someting(){
  const typ = type( TOS );
  if( typ == type_void ){
    if( value( TOS ) != 0 ){
      set_value( TOS, 0 );
    }
    set_type( TOS, type_boolean );
    return;
  }
  clear( TOS );
  set_value( TOS, 1 );
  set_type( TOS, type_boolean );
}
primitive( "something?", primitive_is_someting );

operator_primitive( "something?", primitive_is_someting );


/*
 *  void? operator
 */

function primitive_is_void(){
  const typ = type( TOS );
  if( typ == type_void ){
    if( value( TOS ) != 0 ){
      set_value( TOS, 0 );
    }else{
      set_value( TOS, 1 );
    }
    set_type( TOS, type_boolean );
    return;
  }
  clear( TOS );
  set_type( TOS, type_boolean );
}
primitive( "void?", primitive_is_void );

operator_primitive( "void?", primitive_is_void );



/*
 *  true? operator
 */

function primitive_is_true(){
  const typ = type( TOS );
  if( typ == type_boolean ){
    if( value( TOS ) != 1 ){
      set_value( TOS, 1 );
    }
    return;
  }
  clear( TOS );
  set_type( TOS, type_boolean );
}
primitive( "true?", primitive_is_true );

operator_primitive( "true?", primitive_is_true );


/*
 *  false? operator
 */

function primitive_is_false(){
  const typ = type( TOS );
  if( typ == type_boolean ){
    if( value( TOS ) != 0 ){
      set_value( TOS, 0 );
    }else{
      set_value( TOS, 1 );
    }
    return;
  }
  clear( TOS );
  set_type( TOS, type_boolean );
}
primitive( "false?", primitive_is_false );

operator_primitive( "false?",  primitive_is_false  );


/*
 *  not unary boolean operator
 */

function  primitive_not(){
  check_de&&mand_boolean( TOS );
  if( value( TOS ) == 0 ){
    set_value( TOS, 1 );
  }else{
    set_value( TOS, 0 );
  }
}
operator_primitive( "not", primitive_not );


/*
 *  or binary boolean operator
 */

function primitive_or(){
  const p2 = pop_boolean();
  check_de&&mand_boolean( TOS );
  if( value( TOS ) == 0 ){
    set_value( TOS, p2 );
  }
}
operator_primitive( "or", primitive_or );


/*
 *  and binary boolean operator
 */

function primitive_and(){
  const p2 = pop_boolean();
  check_de&&mand_boolean( TOS );
  if( value( TOS ) != 0 ){
    set_value( TOS, p2 );
  }
}
operator_primitive( "and", primitive_and );


/*
 *  xor binary boolean operator
 */

function  primitive_xor(){
  const p2 = pop_boolean();
  check_de&&mand_boolean( TOS );
  if( value( TOS ) != 0 ){
    if( value( p2 ) != 0 ){
      set_value( TOS, 0 );
    }
  }else{
    if( p2 == 0 ){
      set_value( TOS, 1 );
    }
  }
}
operator_primitive( "xor", primitive_xor );


/*
 *  Relational boolean operators
 */

/*!c{*/

binary_boolean_operator(  ">?",    ( a, b ) => ( a >   b ) ? 1 : 0 );
binary_boolean_operator(  "<?",    ( a, b ) => ( a <   b ) ? 1 : 0 );
binary_boolean_operator(  ">=?",   ( a, b ) => ( a >=  b ) ? 1 : 0 );
binary_boolean_operator(  "<=?",   ( a, b ) => ( a <=  b ) ? 1 : 0 );

unary_boolean_operator(   "=1?",   ( x )    => ( x ==  1 ) ? 1 : 0 );
unary_boolean_operator(   "=-1?",  ( x )    => ( x == -1 ) ? 1 : 0 );
unary_boolean_operator(   "=0?",   ( x )    => ( x ==  0 ) ? 1 : 0 );
unary_boolean_operator(   "<>0?",  ( x )    => ( x !=  0 ) ? 1 : 0 );
unary_boolean_operator(   "<0?",   ( x )    => ( x  <  0 ) ? 1 : 0 );
unary_boolean_operator(   "<=0?",  ( x )    => ( x <=  0 ) ? 1 : 0 );
unary_boolean_operator(   ">0?",   ( x )    => ( x  >  0 ) ? 1 : 0 );
unary_boolean_operator(   ">=0?",  ( x )    => ( x >=  0 ) ? 1 : 0 );

/*}{

void checked_int_is_greater_than(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a > b );
}

void checked_int_is_less_than(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a < b );
}

void checked_int_is_greater_or_equal(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a >= b );
}

void checked_int_is_less_or_equal(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a <= b );
}


operator_primitive(  ">?",    checked_int_is_greater_than );
operator_primitive(  "<?",    checked_int_is_less_than );
operator_primitive(  ">=?",   checked_int_is_greater_or_equal );
operator_primitive(  "<=?",   checked_int_is_less_or_equal );

void checked_int_is_equal_to_1(){
  const x = pop_integer();
  push_boolean( x == 1 );
}

void checked_int_is_equal_to_minus_1(){
  const x = pop_integer();
  push_boolean( x == -1 );
}

void checked_int_is_equal_to_0(){
  const x = pop_integer();
  push_boolean( x == 0 );
}

void checked_int_is_not_equal_to_0(){
  const x = pop_integer();
  push_boolean( x != 0 );
}

void checked_int_is_less_than_0(){
  const x = pop_integer();
  push_boolean( x < 0 );
}

void checked_int_is_less_or_equal_to_0(){
  const x = pop_integer();
  push_boolean( x <= 0 );
}

void checked_int_is_greater_than_0(){
  const x = pop_integer();
  push_boolean( x > 0 );
}

void checked_int_is_greater_or_equal_to_0(){
  const x = pop_integer();
  push_boolean( x >= 0 );
}


operator_primitive(   "=1?",   checked_int_is_equal_to_1 );
operator_primitive(   "=-1?",  checked_int_is_equal_to_minus_1 );
operator_primitive(   "=0?",   checked_int_is_equal_to_0 );
operator_primitive(   "<>0?",  checked_int_is_not_equal_to_0 );
operator_primitive(   "<0?",   checked_int_is_less_than_0 );
operator_primitive(   "<=0?",  checked_int_is_less_or_equal_to_0 );
operator_primitive(   ">0?",   checked_int_is_greater_than_0 );
operator_primitive(   ">=0?",  checked_int_is_greater_or_equal_to_0 );


}*/


/*
 *  Some more arithmetic operators
 */

/*!c{*/

unary_math_operator( "NOT",      ( x ) => ~x                );
unary_math_operator( "negative", ( x ) => -x                );
unary_math_operator( "sign",     ( x ) => x < 0   ? -1 :  1 );
unary_math_operator( "abs",      ( x ) => x > 0   ?  x : -x );

/*}{

void checked_int_not(){
  const x = pop_integer();
  push_integer( ~x );
}

void checked_int_negative(){
  const x = pop_integer();
  push_integer( -x );
}

void checked_int_sign(){
  const x = pop_integer();
  push_integer( x < 0 ? -1 : 1 );
}

void checked_int_abs(){
  const x = pop_integer();
  push_integer( x > 0 ? x : -x );
}


operator_primitive( "NOT",      checked_int_not      );
operator_primitive( "negative", checked_int_negative );
operator_primitive( "sign",     checked_int_sign     );
operator_primitive( "abs",      checked_int_abs      );

}*/

/* -------------------------------------------------------------------------
 *  Floating point arithmetic, 32 bits
 */

/*
 *  is-a-float? primitive - check if a value is a float
 */

function primitive_is_a_float(){
  const tos = POP();
  push_boolean( is_a_float_cell( tos ) );
}
primitive( "is-a-float?", primitive_is_a_float );


/*
 *  to-float primitive - convert something into a float
 */

function push_float( f : Float ){
  const c = PUSH();
  // Typescript version:
  /**/ mem32f[ c ] = f;
  // C++ version:
  //c/ *( float* ) ( ( void* ) ( c << 4 ) ) = f;
  set_type( c, type_float );
  set_name( c, tag_float );
}

/*
 *  to-float primitive - convert something into a float
 */

function primitive_to_float(){

  const tos = POP();

  if( is_a_float_cell( tos ) ){
    PUSH();
    return;
  }

  if( is_an_integer_cell( tos ) ){
    /**/ const f = mem32f[ tos ];
    //c/ auto  f = *( float* ) ( ( void* ) ( tos << 4 ) );
    push_float( f );
    return;
  }

  if( is_a_text_cell( tos ) ){
    /**/ const f = parseFloat( cell_to_text( tos ) );
    //c/ auto  f = (Float) atof( cell_to_text( tos ).c_str() );
    push_float( f );
    return;
  }

  const auto_txt = cell_to_text( tos );
  /**/ const f = parseFloat( auto_txt );
  //c/ auto  f = (Float) atof( auto_txt.c_str() );
  push_float( f );

}
primitive( "to-float", primitive_to_float );


/*
 *  float-to-integer primitive - convert a float to an integer
 */

function pop_float() : Float {
  const tos = POP();
  check_de&&mand_cell_type( tos, type_float );
  /**/ const f = mem32f[ tos ];
  //c/ auto  f = *( float *) ( tos << 4 );
  return f;
}


function primitive_float_to_integer(){
  /**/ const f = pop_float();
  /**/ const i = Math.floor( f );
  //c/ auto  f = pop_float();
  //c/ auto  i = ( int ) f;
  push_integer( i );
}
primitive( "float-to-integer", primitive_float_to_integer );


/*
 *  float-to-text primitive - convert a float to a text
 */

function primitive_float_to_text(){
  const auto_f = pop_float();
  /**/ const auto_t = auto_f.toString();
  /*c{
    // ToDo: that's a lot of stack memory
    // Using a static buffer would be better but not thread safe
    char auto_t[ 100 ];
    sprintf_s( auto_t, sizeof( auto_t ), "%f", auto_f );
  }*/
  push_text( auto_t );
}


/*
 *  float-add primitive - add two floats
 */

function primitive_float_add(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 + auto_f2 );
}
primitive( "float-add", primitive_float_add );


/*
 *  float-subtract primitive - subtract two floats
 */

function primitive_float_subtract(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 - auto_f2 );
}
primitive( "float-subtract", primitive_float_subtract );


/*
 *  float-multiply primitive - multiply two floats
 */

function primitive_float_multiply(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 * auto_f2 );
}
primitive( "float-multiply", primitive_float_multiply );


/*
 *  float-divide primitive - divide two floats
 */

function primitive_float_divide(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 / auto_f2 );
}
primitive( "float-divide", primitive_float_divide );


/*
 *  float-remainder primitive - remainder of two floats
 */

function primitive_float_remainder(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  /**/ const auto_f = auto_f1 % auto_f2;
  //c/ auto  auto_f = std::fmod( auto_f1, auto_f2 );
  push_float( auto_f );
}
primitive( "float-remainder", primitive_float_remainder );


/*
 *  float-power primitive - power of two floats
 */

function primitive_float_power(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.pow( auto_f1, auto_f2 );
  //c/ auto  auto_f = std::pow( auto_f1, auto_f2 );
  push_float( auto_f );
}


/*
 *  float-sqrt primitive - square root of a float
 */

function primitive_float_sqrt(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.sqrt( auto_f1 );
  //c/ auto  auto_f = std::sqrt( auto_f1 );
  push_float( auto_f );
}
primitive( "float-sqrt", primitive_float_sqrt );


/*
 *  float-sin primitive - sine of a float
 */

function primitive_float_sin(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.sin( auto_f1 );
  //c/ auto  auto_f = std::sin( auto_f1 );
  push_float( auto_f );
}
primitive( "float-sin", primitive_float_sin );


/*
 *  float-cos primitive - cosine of a float
 */

function primitive_float_cos(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.cos( auto_f1 );
  //c/ auto  auto_f = std::cos( auto_f1 );
  push_float( auto_f );
}
primitive( "float-cos", primitive_float_cos );


/*
 *  float-tan primitive - tangent of a float
 */

function primitive_float_tan(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.tan( auto_f1 );
  //c/ auto  auto_f = std::tan( auto_f1 );
  push_float( auto_f );
}
primitive( "float-tan", primitive_float_tan );


/*
 *  float-asin primitive - arc sine of a float
 */

function primitive_float_asin(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.asin( auto_f1 );
  //c/ auto  auto_f = std::asin( auto_f1 );
  push_float( auto_f );
}
primitive( "float-asin", primitive_float_asin );


/*
 *  float-acos primitive - arc cosine of a float
 */

function primitive_float_acos(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.acos( auto_f1 );
  //c/ auto  auto_f = std::acos( auto_f1 );
  push_float( auto_f );
}
primitive( "float-acos", primitive_float_acos );


/*
 *  float-atan primitive - arc tangent of a float
 */

function primitive_float_atan(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.atan( auto_f1 );
  //c/ auto  auto_f = std::atan( auto_f1 );
  push_float( auto_f );
}
primitive( "float-atan", primitive_float_atan );


/*
 *  float-log primitive - natural logarithm of a float
 */

function primitive_float_log(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.log( auto_f1 );
  //c/ auto  auto_f = std::log( auto_f1 );
  push_float( auto_f );
}
primitive( "float-log", primitive_float_log );


/*
 *  float-exp primitive - exponential of a float
 */

function primitive_float_exp(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.exp( auto_f1 );
  //c/ auto  auto_f = std::exp( auto_f1 );
  push_float( auto_f );
}
primitive( "float-exp", primitive_float_exp );


/*
 *  float-floor primitive - floor of a float
 */

function primitive_float_floor(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.floor( auto_f1 );
  //c/ auto  auto_f = std::floor( auto_f1 );
  push_float( auto_f );
}
primitive( "float-floor", primitive_float_floor );


/*
 *  float-ceiling primitive - ceiling of a float
 */

function primitive_float_ceiling(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.ceil( auto_f1 );
  //c/ auto  auto_f = std::ceil( auto_f1 );
  push_float( auto_f );
}
primitive( "float-ceiling", primitive_float_ceiling );


/*
 *  float-round primitive - round a float
 */

function primitive_float_round(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.round( auto_f1 );
  //c/ auto  auto_f = std::round( auto_f1 );
  push_float( auto_f );
}
primitive( "float-round", primitive_float_round );


/*
 *  float-truncate primitive - truncate a float
 */

function primitive_float_truncate(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.trunc( auto_f1 );
  //c/ auto  auto_f = std::trunc( auto_f1 );
  push_float( auto_f );
}
primitive( "float-truncate", primitive_float_truncate );


/* -------------------------------------------------------------------------
 *  Text handling
 */

/*
 *  & - text concatenation operator
 */

function primitive_text_join(){
// Text concatenation, t1 t2 -- t3
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_text( auto_t1 + auto_t2 );
}
primitive( "text-join", primitive_text_join );


operator_primitive( "&", primitive_text_join );


/*
 *  text-cut primitive - extract a cut of a text, remove a suffix
 */

function primitive_text_cut(){
  const n = pop_integer();
  const auto_t = pop_as_text();
  push_text( tcut( auto_t, n ) );
}
primitive( "text-cut", primitive_text_cut );


/*
 *  text-length primitive - length of a text
 */

function primitive_text_length(){
  const auto_t = pop_as_text();
  push_integer( tlen( auto_t ) );
}
primitive( "text-length", primitive_text_length );


/*
 *  text-but primitive - remove a prefix from a text, keep the rest
 */

function               primitive_text_but(){
  const n = pop_integer();
  const auto_t = pop_as_text();
  push_text( tbut( auto_t, n ) );
}
primitive( "text-but", primitive_text_but );


/*
 *  text-mid primitive - extract a part of the text
 */

function primitive_text_mid(){
  const n = pop_integer();
  const m = pop_integer();
  const auto_t = pop_as_text();
  push_text( tmid( auto_t, m, n ) );
}
primitive( "text-mid", primitive_text_mid );


/*
 *  text-low primitive - convert a text to lower case
 */

function primitive_text_low(){
  const auto_t = pop_as_text();
  push_text( tlow( auto_t ) );
}
primitive( "text-low", primitive_text_low );


/*
 *  text-up primitive - convert a text to upper case
 */

function primitive_text_up(){
  const auto_t = pop_as_text();
  push_text( tup( auto_t ) );
}
primitive( "text-up", primitive_text_up );


/*
 *  text=? primitive - compare two texts
 */

function primitive_text_eq(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_boolean( teq( auto_t1, auto_t2 ) );
}
primitive( "text=?", primitive_text_eq );


/*
 *  text<>? primitive - compare two texts
 */

function primitive_text_neq(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_boolean( tneq( auto_t1, auto_t2 ) );
}
primitive( "text<>?", primitive_text_neq );


/*
 *  text-find primitive - find a piece in a text
 */

function primitive_text_find(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_integer( tidx( auto_t1, auto_t2 ) );
}
primitive( "text-find", primitive_text_find );


/*
 *  text-find-last primitive - find a piece in a text
 */

function primitive_text_find_last(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_integer( tidxr( auto_t1, auto_t2 ) );
}
primitive( "text-find-last", primitive_text_find_last );


/*
 *  text-line primitive - extract a line from a text
 */

function  primitive_text_line(){
  const n = pop_integer();
  const auto_t = pop_as_text();
  push_text( extract_line( auto_t, n ) );
}
primitive( "text-line", primitive_text_line );


/*
 *  as-text primitive - textual representation
 */

function primitive_as_text(){
  if( type( TOS ) == type_text )return;
  push_text( pop_as_text() );
}
primitive( "as-text", primitive_as_text );


/*
 *  dump primitive - textual representation, debug style
 */

function primitive_dump(){
  push_text( dump( POP() ) );
}
primitive( "dump", primitive_dump );


/*
 *  ""? unary operator
 */

const the_empty_text_value = value( the_empty_text_cell );
// de&&mand_eq( the_empty_text_value, 0 );

const tag_empty_text = tag( "empty?" );


function is_empty_text_cell( c : Cell ) : boolean {
  if( type( c ) != type_text )return false;
  if( value( c ) == the_empty_text_value )return true;
  //c/ if( *(char*) value( c ) == 0 )return true;
  return false;
}

/*
 *  ""? unary operator - true if TOS is the empty text
 */

function primitive_is_empty_text(){
  if( type( TOS ) != type_text ){
    clear( TOS );
    set( TOS, type_boolean, tag_empty_text, 0 );
  }else{
    const it_is = is_empty_text_cell( TOS );
    clear( TOS );
    set( TOS, type_boolean, tag_empty_text, it_is ? 1 : 0 );
  }
}
operator_primitive( "\"\"?", primitive_is_empty_text );


/*
 *  named? operator - true if NOS's name is TOS tag
 */

const tag_is_named = tag( "named?" );

function primitive_is_named(){
  const t = pop_tag();
  const c = POP();
  if( name( c ) == t ){
    clear( TOS );
    set( TOS, type_boolean, tag_is_named, 1 );
  }else{
    clear( TOS );
    set( TOS, type_boolean, tag_is_named, 0 );
  }
}
operator_primitive( "named?", primitive_is_named );


/* -----------------------------------------------------------------------------
 *
 */

function inox_machine_code_cell_to_text( c : Cell ) : Text {
// Decompilation of a single machine code.

  // Never dereference a null pointer
  if( c == 0 ){
    return "No code at IP 0";
  }

  // What type of code is this, Inox verb, primitive, literal, jump?
  let t;
  let n;
  /**/ let  name_text : Text;
  //c/ Text name_text;
  /**/ let fun : Primitive;
  //c/ Primitive fun;

  t = type( c );
  n = name( c );

  // If code is a primitive. That's when type is void; what a trick!
  if( t == type_void ){

    if( get_primitive( n ) == no_operation ){
      return S()+ "Invalid primitive cell " + C( c )
      + " named " + C( n )
      + " (" + ( is_valid_tag( n ) ? tag_to_text( n ) : no_text ) + ")";
    }

    fun = get_primitive( n );
    name_text = tag_to_text( n );
    return S()+ name_text + " ( cell " + C( c )
    + " is primitive " + F( fun ) + " )";

  // If code is the integer id of a verb, an execution token, xt in Forth jargon
  }else if ( t == type_verb ){
    if( n == 0x0000 ){
      debugger;
      return S()+ name_text + " return ( cell " + C( c )
      + " is verb return 0x0000 )";
    }
    if( ! is_valid_tag( n ) ){
      return S()+ "Invalid verb cell " + C( c )
      + " named " + C( n );
    }
    name_text = tag_to_text( n );
    return S()+ name_text + " ( cell " + C( c ) + " is a verb )";

  // If code is a literal
  }else{
    return S()+ dump( c ) + " ( cell " + C( c ) + " is a literal )";
  }

}


function verb_flags_dump( flags : u32 ) : Text {
// Return a text that describes the flags of an Inox verb.
  let auto_buf = S();
  if( ( flags & immediate_verb_flag ) == immediate_verb_flag ){
    auto_buf += " immediate";
  }
  if( ( flags & hidden_verb_flag ) == hidden_verb_flag ){
    auto_buf += " hidden";
  }
  if( ( flags & operator_verb_flag ) == operator_verb_flag ){
    auto_buf += " operator";
  }
  if( ( flags & block_verb_flag ) == block_verb_flag ){
    auto_buf += " block";
  }
  if( ( flags & inline_verb_flag ) == inline_verb_flag ){
    auto_buf += " inline";
  }
  if( ( flags & primitive_verb_flag ) == primitive_verb_flag ){
    auto_buf += " primitive";
  }
  return auto_buf;
}


function verb_to_text_definition( id : Index ) : Text {

  // Return the decompiled source code that defines the Inox verb.
  // A non primitive Inox verb is defined using an array of cells that
  // are either other verbs, primitives or literal values

  let auto_text_name = tag_to_text( id );

  // The definition is an array of cells
  let def = definition( id );

  // The prior cell stores flags & length
  let flags_and_length = value( def - ONE );
  let flags  = flags_and_length & verb_flags_mask;
  let length = flags_and_length & verb_length_mask;

  // ToDo: add a pointer to the previous verb definition

  let auto_buf = S();
  auto_buf += ": " + auto_text_name + " ( definition of " + auto_text_name
  + ", verb " + C( id )
  + ", cell " + C( def )
  + ( flags != 0 ? ( S()+ ", flags" + verb_flags_dump( flags ) ) : no_text )
  + ", length " + N( length ) + " )\n";

  let ip = 0;
  let c  = 0;

  while( ip < length ){
    c = def + ip * ONE;
    // Filter out final "return"
    if( ip + 1 == length ){
      de&&mand_eq( value( c ), 0x0 );
      de&&mand_eq( type(  c ), type_void );
    }
    auto_buf += "( " + C( ip ) + " ) "
    + inox_machine_code_cell_to_text( c ) + "\n";
    ip++;
  }

  return auto_buf;

}


/* -----------------------------------------------------------------------------
 *  Constants and variables
 *  a constant is just a verb that pushes a literal onto the data stack.
 *  a global variable is two words, xxx and xxx!, to get/set the value.
 *  a control variable is a transient cell in the control stack.
 *  a data variable is a transient cell in the data stack.
 *  Read and write access to variables is possible directly or by address.
 *  Local and data variables use dynanic scopes, ie the variables are
 *  searched in a stack, from top to bottom.
 *  See https://wiki.c2.com/?DynamicScoping
 */

/*
 *  peek primitive - Get the value of a cell, using a cell's address.
 *  This is very low level, it's the Forth @ word (fetch).
 *  Peek/Poke is BASIC style, it's not Forth style.
 */

function primitive_peek(){
  copy_cell( value( TOS ), TOS );
}
primitive( "peek", primitive_peek );


/*
 *  poke primitive - Set the value of a cell, using a cell's address.
 *  This is very low level, it's the Forth ! word (store).
 */

primitive( "poke", primitive_poke );
function           primitive_poke(){
  const address = pop_integer();
  const tos = POP();
  move_cell( tos, address );
}


/*
 *  make-constant primitive
 */

function primitive_make_constant(){
// Create a getter verb that pushes a literal onto the data stack

  // Get value, then name
  const value_cell = POP();

  // Create a verb to get the content, first get it's name
  const name_cell = POP();
  const auto_constant_name = cell_to_text( name_cell );
  de&&mand( tneq( auto_constant_name, no_text ) );
  const name_id = tag( auto_constant_name );
  de&&mand_neq( name_id, 0 );
  clear( name_cell );

  // Allocate space for verb header, value and return instruction
  // Allocate one more cell for the case where it is global variable
  // because small verbs are inlined (when length <= 2), see hack below.
  // ToDo: there could be a "prevent inlining" flag in the verb header
  const header = allocate_cells( 1 + 1 + 1 + 1 );

  // flags and length, length may be patched into 3 by make-variable()
  set( header, type_integer, name_id, 1 + 1 );

  // Skip that header
  const def = header + 1 * ONE;

  // Add Literal value
  move_cell( value_cell, def + 0 * ONE );

  // Add return instruction
  set_return_cell( def + 1 * ONE );

  register_method_definition( name_id, def );

  if( de ){
    mand_eq( definition( name_id ), def );
    mand_eq(
      value( definition( name_id ) + ONE ),
      0x0000  // return
    );
  }

}
primitive( "make-constant", primitive_make_constant );


/*
 *  tag-defined? primitive
 */

const tag_is_tag_defined = tag( "tag-defined?" );

function primitive_is_tag_defined(){
  // Return true if the verb is defined in the dictionary
  const name_cell = POP();
  const auto_name_text = cell_to_text( name_cell );
  const exists = verb_exists( auto_name_text );
  clear( name_cell );
  set( name_cell, type_boolean, tag_is_tag_defined, exists ? 1 : 0 );
}
primitive( "tag-defined?", primitive_is_tag_defined );


/*
 *  defined? primitive
 */

const tag_is_defined = tag( "defined?" );

function primitive_is_defined(){
// Return true if the name is defined in the dictionary
  const name_cell = POP();
  de&&mand_tag( name_cell );
  const name_id = value( name_cell );
  const exists = verb_exists( tag_to_text( name_id ) );
  reset( name_cell );
  set( name_cell, type_boolean, tag_is_defined, exists ? 1 : 0 );
}
primitive( "defined?", primitive_is_defined );


/*
 *  make-global primitive - Create a global variable and two verbs to
 *  get/set it. Getter is named like the variable, setter is named like
 *  the variable with a "!" suffix.
 */

const tag_peek = tag( "peek" );
const tag_poke = tag( "poke" );

function  primitive_make_global(){

  // Create a getter verb to read the global variable like constants does
  primitive_2dup();
  primitive_make_constant();

  clear( POP() );
  const name_id = pop_tag();

  // Patch the length to avoid inlining of short verbs, a big hack!
  const getter_def = definition( name_id );
  de&&mand_eq( definition_length( getter_def ), 2 );
  set_definition_length( getter_def, 3 );  // ToDo: harmfull big hack?

  // Create a setter verb to write the global variable, xxx!
  const auto_verb_name = tag_to_text( name_id );
  const auto_setter_name = auto_verb_name + "!";
  const setter_name_id = tag( auto_setter_name );

  // Allocate space for verb header, cell address, setter and return instruction
  let setter_header = allocate_cells( 1 + 3 );

  // flags and length need an extra word, so does the ending "return"
  set( setter_header, type_integer, setter_name_id, 1 + 1 + 1 + 1 );

  // Skip that header
  const setter_def = setter_header + 1 * ONE;

  // Use the address of the cell in the constant as the parameter for poke
  set( setter_def, type_integer, name_id, getter_def );

  // Add call to primitive poke to set the value when verb runs
  set( setter_def + 1 * ONE, type_void, tag_poke, 0 );

  // Add return instruction
  set_return_cell( setter_def + 2 * ONE );

  register_method_definition( setter_name_id, setter_def );

  // Create a constant named @xxx to get the address of the variable
  // const at_name_id = tag( "@" + name );
  // set_value( name_cell, at_name_id );
  // primitive_make_constant();
  // const at_def = definition( at_name_id );
  // ToDo: store address as cell-pointer type, not as an integer
  // set( at_def, type_integer, at_name_id, getter_def );

}
primitive( "make-global", primitive_make_global );


/*
 *  make-local primitive - Create a local variable in the control stack
 */

function primitive_make_local(){
  const n = pop_tag();
  // the return value on the top of the control stack must be preserved
  const old_csp = CSP;
  CSP += ONE;
  move_cell( old_csp, CSP );
  move_cell( POP(), old_csp );
  set_name( old_csp, n );
}
primitive( "make-local", primitive_make_local );


/* ------------------------------------------------------------------------
 *  call/return with named parameters
 */

const tag_return_without_parameters
= tag( "return-without-parameters" );
const tag_rest  = tag( "rest" );

function is_block( c : Cell ) : boolean {
  // ToDo: should check header of block, ie length & mask
  // ToDo: should be a type_pointer (or type_address maybe)
  // ToDo: type pointer for smart pointers, type address for raw pointers
  // ToDo: type_pointer would be for addresses of dynamic areas
  // No type checking in fast mode
  if( !check_de )return true;
  if( type( c ) != type_integer ){
    return false;
  }
  if( name( c ) != tag_block ){
    return false;
  }
  if( type( value( c ) - ONE ) != type_integer ){
    return false;
  }

  return true;
}


/*
 *  return-without-parameters primitive
 */


const tag_with = tag( "with" );

function primitive_return_without_parameters(){

  // ToDo: the limit should be the base of the control stack
  let limit = 0;
  if( check_de ){
    limit = ACTOR_control_stack;
  }

  while( name( CSP ) != tag_with ){
    clear( CSP );
    CSP -= ONE;
    if( check_de && CSP < limit ){
      FATAL( "/with sentinel out of reach" );
      debugger;
    }
  }

  // Clear the sentinel
  reset( CSP );
  CSP -= ONE;

  // Jump to the return address
  IP = eat_integer( CSP );
  CSP -= ONE;

}
primitive( "return-without-parameters", primitive_return_without_parameters );


/*
 *  run-with-parameters primitive
 */

const tag_run_with_parameters = tag( "run-with-parameters" );

// In C++, the definition is available later, see init_globals()
let return_without_parameters_definition = 0;
// = definition( tag_return_without_parameters );


function primitive_run_with_parameters(){
// Create variables in the control stack for verbs with formal parameters.
// Up to with sentinel. Usage : with /a /b { xxx } run-with-parameters

  // Pop block to execute
  const block = pop_block();

  let new_tos = TOS;

  // Count formal parameters up to with sentinel included
  let count = 0;
  let parameter_name;
  while( true ){
    parameter_name = name( new_tos );
    count++;
    if( parameter_name == tag_rest ){
      // ToDo: special /rest parameter should make a list object with the rest
    }
    if( parameter_name == tag_with )break;
    if( count > 10 ){
      bug( "Too many parameters, more then ten" );
      debugger;
      break;
    }
    new_tos -= ONE;
  }

  save_ip( tag_run_with_parameters );

  // Set value of parameters using values from the data stack
  const csp = CSP;
  let copy_count = 0;
  let n;

  // Go from sentinel argument back to tos, push each actual parameter
  const sentinel_tos = new_tos;
  let actual_argument_cell  = csp;
  let formal_parameter_cell = new_tos;
  let source_argument_cell  = new_tos - ( count - 1 ) * ONE;

  de&&mand_cell_name( sentinel_tos, tag_with );
  de&&mand_tag( sentinel_tos );

  while( copy_count < count ){

    // Process sentinel cell, actual argument is number of formal parameters
    if( copy_count == 0 ){
      de&&mand_cell_name( formal_parameter_cell, tag_with );
      set( actual_argument_cell, type_integer, tag_with, count - 1 );
      clear( formal_parameter_cell ); // ToDo: raw?
      actual_argument_cell  += ONE;
      formal_parameter_cell += ONE;
      de&&mand_name( value( formal_parameter_cell ), tag( "a") );
      de&&mand_name( name(  formal_parameter_cell ), tag( "a") );
      copy_count++;
      continue;
    }

    if( copy_count == 1 ){
      mand_name( value( formal_parameter_cell ), tag( "a" ) );
      mand_name( name(  formal_parameter_cell ), tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( name( formal_parameter_cell ), tag( "b" ) );
    }

    n = name( formal_parameter_cell );
    clear( formal_parameter_cell ); // ToDo: raw?
    formal_parameter_cell += ONE;

    move_cell( source_argument_cell, actual_argument_cell );
    set_name( actual_argument_cell, n );

    actual_argument_cell  += ONE;
    source_argument_cell  += ONE;

    if( copy_count == 1 ){
      mand_name( n, tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( n, tag( "b" ) );
    }
    copy_count++;
  }

  // Skip actual arguments and formal parameters in data stack
  TOS = TOS - ( ( count * 2 ) - 1 ) * ONE;

  // Add return call to the parameters remover
  CSP += count * ONE;
  set(
    CSP,
    type_integer,
    tag_return_without_parameters,
    return_without_parameters_definition
  );

  // Execute the block, on return it will jump to the parameters remover
  IP = block;

}
primitive( "run-with-parameters", primitive_run_with_parameters );


/*
 *  local primitive - copy a control variable to the data stack
 */

function primitive_local(){
// Copy the value of a control variable from the control stack to the data one
  const n = eat_tag( TOS );
  // Starting from the top of the control stack, find the variable
  let ptr = CSP;
  while( name( ptr ) != n ){
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_control_stack ){
        FATAL( "Local variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  copy_cell( ptr, TOS );
}
primitive( "local", primitive_local );


/*
 *  set-local primitive - assign a value to a local variable
 */

function primitive_set_local(){
  const n = pop_tag();
  // Starting from the top of the control stack, find the variable
  let ptr = CSP;
  while( name( ptr ) != n ){
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_control_stack ){
        FATAL( "Local variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  move_cell( POP(), ptr );
  set_name( ptr, n );
}
primitive( "set-local", primitive_set_local );


/*
 *  data primitive
 */

function primitive_data(){
// Copy the value of a data variable from the data stack
  const n = eat_tag( TOS );
  // Starting from cell below TOS
  let ptr = TOS - ONE;
  while( name( ptr ) != n ){
    // Down to bottom of data stack
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_data_stack ){
        FATAL( "Data variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  // Found it, copy it to TOS
  copy_cell( ptr, TOS );
}
primitive( "data", primitive_data );


/*
 *  set-data primitive
 */

function primitive_set_data(){
// Set the value of a data variable in the data stack
  const n = pop_tag();
  // Starting from cell below TOS
  let ptr = TOS - ONE;
  while( name( ptr ) != n ){
    // Down to bottom of data stack
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_data_stack ){
        FATAL( "Data variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  // Found it, change value
  move_cell( POP(), ptr );
  // But keep the name
  set_name( ptr, n );
}
primitive( "set-data", primitive_set_data );


/*
 *  size-of-cell primitive
 */

function primitive_size_of_cell(){
  set( PUSH(), type_integer, tag( "size-of-cell" ), size_of_cell );
}
primitive( "size-of-cell", primitive_size_of_cell );


/*
 *  Indirect access to variables, like pointers in C
 */

/**/ function cell_lookup(
/**/   start : Cell,
/**/   end   : Cell,
/**/   tag   : Tag,
/**/   nth   : Index
/**/ ) : Cell {
/*c{
Cell cell_lookup(
  Cell start,
  Cell end,
  Tag  tag,
  Index nth
) {
}*/
  let found = 0;
  let ptr = start;
  if( start < end ){
    while( true ){
      if( name( ptr ) == tag ){
        if( nth == 0 ){
          found = ptr;
          break;
        }else{
          nth--;
        }
      }
      if( ptr == end )break;
      ptr++;
    }
  }else if( start > end ){
    while( true ){
      if( name( ptr ) == tag ){
        if( nth == 0 ){
          found = ptr;
          break;
        }else{
          nth--;
        }
      }
      if( ptr == end )break;
      ptr--;
    }
  }else{
    found = name( ptr ) == tag && nth == 0 ? ptr : 0;
  }
  return found;
}


/*
 *  lookup primitive - find a variable in a memory area.
 *  The memory area is defined by a start and end pointer.
 *  The variable is defined by a tag.
 *  The nth variable is found.
 *  The result is an integer pointer to the variable, or 0 if not found.
 *  Usage: lookup( tag, start, end, nth )
 *  See peek() and poke() for read and write access to the variable.
 */

function primitive_lookup(){
  const nth        = pop_integer();
  const end_ptr    = pop_integer();
  const start_ptr  = pop_integer();
  const n = eat_tag( TOS );
  let found = cell_lookup( start_ptr, end_ptr, n, nth );
  set( TOS, type_integer, tag( "lookup" ), found );
}
primitive( "lookup", primitive_lookup );


/*
 *  upper-local primitive
 */

function primitive_upper_local(){
// Get the value of the nth named value inside the control stack, or void
  de&&mand_eq( type( TOS ), type_integer );
  const nth        = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  let found = cell_lookup( CSP, ACTOR_control_stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    reset( TOS );
  }
}
primitive( "upper-local", primitive_upper_local );


/*
 *  upper-data primitive - get a data variable in the nth upper frame, or void
 */

function primitive_upper_data(){
  const nth = pop_integer();
  const n   = eat_tag( TOS );
  let found = cell_lookup( TOS - ONE, ACTOR_data_stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    reset( TOS );
  }
}
primitive( "upper-data", primitive_upper_data );


/*
 *  set-upper-local primitive - set a local variable in the nth upper frame
 */

function primitive_set_upper_local(){
  const nth = pop_integer();
  const n   = pop_tag();
  let found = cell_lookup( CSP, ACTOR_control_stack, n, nth );
  if( found ){
    move_cell( POP(), found );
  }else{
    FATAL( S()+ "Control nth" + N( nth )
    + " variable not found, named " + tag_to_text( n ) );
  }
}
primitive( "set-upper-local", primitive_set_upper_local );


/*
 *  set-upper-data primitive -
 */

function primitive_set_upper_data(){
  const nth   = pop_integer();
  const n     = pop_tag();
  const found = cell_lookup( TOS - ONE, ACTOR_data_stack, n, nth );
  if( found ){
    move_cell( TOS, found );
  }else{
    FATAL( "Data nth" + N( nth )
    + " variable not found, named " + tag_to_text( n ) );
  }
}


/*
 *  without-data primitive - remove down to a data variable in the data stack
 */

function primitive_without_data(){
  const n = pop_tag();
  while( name( TOS ) != n ){
    clear( TOS );
    TOS -= ONE;
    if( TOS < ACTOR_data_stack ){
      FATAL( "data-without, missing " + tag_to_text( n ) );
      return;
    }
  }
  clear( TOS );
  TOS -= ONE;
}
primitive( "without-data", primitive_without_data );


/* -----------------------------------------------------------------------------
 *  Object creation and access to the it variable.
 */

// Javascript uses "this", some other languages use "self".
const tag_it = tag( "it" );

/*!c{*/

function make_circular_object_from_js( obj : any, met : Map< string, any> ) : Cell {

  // The first item is the name of the class.
  const class_name = tag( obj.constructor.name );

  // How many properties are there inside that object?
  const keys = obj.keys();
  const length = keys.length;

  // Allocate enough memory to hold all of that
  const cell = allocate_area( length * size_of_cell );

  // First cell is name:length
  init_cell( cell, length, pack( type_integer, class_name ) );
  let top = cell + size_of_word;

  // Them come the properties, numeric indexes first, then named
  let ii : Index = 0;

  // Inox does not handle sparse arrays
  // ToDo: implement sparse arrays, the Lua way.
  let sparse_idx = 0;

  if( length == 0 )return;

  // Check if object is an array, when it starts with numeric keys
  const first_key = obj[ 0 ];

  // First, process the array part, then the map part
  let array_part = true;
  const tag_item = tag( "item" );
  let name = tag_void;
  let val;
  while( ii < length ){
    const key = keys[ ii++ ];
    if( array_part ){
      if( typeof key != "number" ){
        array_part = false;
      }
      const idx : Index = key;
      // Detect floats
      if( !Number.isInteger( idx ) ){
        array_part = true;
      }else{
        // Detect sparse array
        if( idx != sparse_idx ){
          array_part = false;
        }else{
          sparse_idx = idx;
        }
      }
    }
    val = obj[ key ];
    if( array_part ){
      name = tag_item;
    }else{
      name = tag( key );
    }
    // Depending on type
    let c : Cell;
    const js_type = typeof val;

    if( js_type == "number" ){
      if( Number.isInteger( val ) ){
        c = allocate_cell();
        set_integer_cell( c, val );
      }else{
        // ToDo: c = make_float_cell( val )
      }

    }else if( js_type == "boolean" ){
      c = allocate_cell();
      set_integer_cell( c, val ? 1 : 0 );

    }else if( js_type == "string" ){
      c = allocate_cell();
      set_text_cell( c, val );

    }else if( js_type == "object" ){
      c = make_circular_object_from_js( val, met );
    }
    if( c == the_void_cell ){
      // Already void
    }else{
      move_cell( c, top );
      set_name( top, name );
      free_cell( c );
    }
    top += ONE;
  }

  return cell;

} // make_circular_object_from_js()


function make_object_from_js( obj : any ) : Cell {
// Build a new Inox object from a Javascript one, a deep clone.
  // Handle circular references
  let met_objects = new Map< string, any >;
  const new_cell = make_circular_object_from_js( obj, met_objects );
  // Free whatever memory the map uses
  met_objects = null;
  return new_cell;
}

/*c*/


function  object_length( header : Cell ) : Count {
// Get the number of cells of the object
  // This does not include the headers used for memory management
  // The first cell of the object contains the length, whereas the
  // it's name is the class of the object. That first cell is not
  // included in the length.
  const length = value( header );
  return length;
}


/*
 *  make-fixed-object primitive
 *  On extensible objects, more push and pop operations are anticipated
 *  Implementation may detect when object is full and need to be extended.
 */

const tag_out_of_memory = tag( "out-of-memory" );

primitive( "make-fixed-object", primitive_make_fixed_object );
function                        primitive_make_fixed_object(){

// Make an object from values plus header. v1 v2 ... vnn name:nn -- name:ptr
// Returns a pointer value that points to the new object in dynamic memory.
// Whenever that pointer is copied, a reference counter is incremented.
// Whenever a pointer is disposed, the counter is decremented.
// When the counter reaches zero, each member is also disposed and the
// dynamic memory to store the object is released back to the heap of
// cells.

  // Get the maximum length of the object
  const max_length = pop_integer();

  // Get the number of attributes and class name from named integer value at TOS
  check_de&&mand_integer(   TOS );
  const length     = value( TOS );
  const class_name = name(  TOS );

  // ToDo: should there be an upper limit on the length?
  check_de&&mand( length > 0 && length < 100 );

  // Allocate a cell for the class/length and cells for the values
  const dest = allocate_area( max_length * size_of_cell );
  if( dest == 0 ){
    // ToDo: raise an exception?
    set( TOS, type_tag, tag_out_of_memory, 0 );
    return;
  }

  // Move the values from the stack to the object
  // ToDo: this could be optimized by moving the whole area at once
  // but that would require to reverse the order of the values on the stack
  let ii;
  for( ii = 0 ; ii < length; ii++ ) {
    raw_move_cell( POP(), dest + ii * ONE );
  }

  // The first element is the named length
  de&&mand_eq( value( dest ), length );
  de&&mand_eq( name(  dest ), class_name );

  // Return the named reference to the object
  // ToDo: should skip the first cell and skip the header as done with areas?
  set( PUSH(), type_reference, class_name, dest );
}


/*
 *  make-object primitive
 */

primitive( "make-object", primitive_make_object );
function                  primitive_make_object(){
  // The length and the capacity are the same
  primitive_dup();
  // That's just a fixed object with no room for more attributes!
  primitive_make_fixed_object();
}


/*
 *  extend-object primitive
 */

primitive( "extend-object", primitive_extend_object );
function                    primitive_extend_object(){
// Turn a fixed object into an extensible one

  const o = pop_reference();
  const len = object_length( o );

  // Silently ignore if alreay extended
  if( type( o ) == type_reference ){
    return;
  };

  // Allocate the extended area
  const ptr = allocate_area( len * size_of_cell );
  if( ptr == 0 ){
    // ToDo: raise an exception, return 0?
    FATAL( "out-of-memory" );
  }

  // Move the object's attributes to the extended area
  move_cells( o, ptr, len );

  // Change the type of the object's content
  set( o, type_reference, name( o ), ptr );

  // Free the now unused portion of the fixed object's area
  resize_area( o, 1 * ONE );

}


/*
 *  object-get primitive
 */

primitive( "object-get", primitive_object_get );
function                 primitive_object_get(){
// Copy the value of an instance variable from an object

  const tos = POP();
  const obj = TOS;
  let ptr = value( obj );

  // ToDo: Void from void?
  if( ptr == 0x0 ){
    de&&mand( info( obj ) == 0 );
    clear( tos );
    clear( obj );
    return;
  }

  if( check_de ){
    mand_tag( tos );
    mand_cell_type( obj, type_reference );
    // ToDo: fatal error
  }

  // Add an indirection level if objet is extensible
  if( type( ptr ) == type_reference ){
    ptr = get_reference( ptr );
  }

  let limit = 0;
  if( check_de ){
    limit = ptr + object_length( ptr ) * ONE;
  }

  // Skip the class name & length header first cell
  ptr += ONE;

  const n = name( tos );
  while( name( ptr ) != n ){
    // ToDo: go backward? That would process the array as a stack
    ptr += ONE;
    if( check_de && limit != 0 ){
      if( ptr > limit ){
        FATAL( "Object variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }

  clear( tos );
  copy_cell( ptr, obj );

}


/*
 *  object-set primitive
 */

primitive( "object-set", primitive_object_set );
function                 primitive_object_set(){
// Set the value of an instance variable, aka attribute, of an object

  const n = pop_tag();

  check_de&&mand_cell_type( TOS, type_reference );
  const obj = POP();
  let ptr = value( obj );

  // Add an indirection level if objet is extensible
  if( type( ptr ) == type_reference ){
    ptr = get_reference( ptr );
  }

  let limit = 0;
  if( check_de ){
    limit = ptr + object_length( ptr ) * ONE;
  }

  // Skip the class name & length header first cell
  ptr += ONE;

  // Find the cell with the desired name
  while( name( ptr ) != n ){
    // ToDo: go backward?
    ptr += ONE;
    if( check_de && limit != 0 ){
      if( ptr > limit ){
        FATAL( "Object variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }

  move_cell( POP(), ptr );

  // Restore initial name
  set_name( ptr, n );
  clear( obj );

}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object
 */

/*
 *  stack-push primitive
 */

primitive( "stack-push", primitive_stack_push );
function                 primitive_stack_push(){
  // Push a value on the stack of an object
  const value_cell = POP();
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  move_cell( value_cell, target + length * ONE );
  set_value( target, length + 1 );
}


/*
 *  stack-drop primitive
 */

primitive( "stack-drop", primitive_stack_drop );
function                 primitive_stack_drop(){
  // Pop a value from the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    FATAL( "stack-pop, empty stack" );
    return;
  }
  move_cell( target + length * ONE, PUSH() );
  set_value( target, length - 1 );
}


primitive( "stack-drop-nice", primitive_stack_drop_nice );
function                 primitive_stack_drop_nice(){
  // Pop a value from the stack of an object, no error if stack is empty
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 )return;
  move_cell( target + length * ONE, PUSH() );
  set_value( target, length - 1 );
}


/*
 *  stack-fetch primitive
 */

primitive( "stack-fetch", primitive_stack_fetch );
function                  primitive_stack_fetch(){
// Fetch a value from the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    FATAL( "stack-fetch, empty stack" );
    return;
  }
  copy_cell( target + length * ONE, PUSH() );
}


primitive( "stack-fetch-nice", primitive_stack_fetch_nice );
function                  primitive_stack_fetch_nice(){
// Fetch a value from the stack of an object, no error if stack is empty
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    PUSH();
    return;
  }
  copy_cell( target + length * ONE, PUSH() );
}


/*
 *  stack-length primitive
 */

primitive( "stack-length", primitive_stack_length );
function                   primitive_stack_length(){
// Return the length of the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  push_integer( length );
}


/*
 *  stack-capacity primitive
 */

const tag_stack_capacity = tag( "stack-capacity" );

primitive( "stack-capacity", primitive_stack_capacity );
function                     primitive_stack_capacity(){
// Return the capacity of the stack of an object
  let target = pop_reference();
  push_integer( stack_capacity( target ) );
  set_tos_name( tag_stack_capacity );
}


/*
 *  stack-dup primitive
 */

primitive( "stack-dup", primitive_stack_dup );
function                primitive_stack_dup(){
// Duplicate the top of the stack of an object
  stack_dup( pop_reference() );
}


/*
 *  stack-clear primitive
 */

primitive( "stack-clear", primitive_stack_clear );
function                  primitive_stack_clear(){
// Clear the stack of an object
  stack_clear( pop_reference() );
}


/**/ function swap_cell( c1 : Cell, c2 : Cell ){
//c/ void swap_cell( Cell c1, Cell c2 ) {
  move_cell( c1, the_tmp_cell );
  move_cell( c2, c1 );
  move_cell( the_tmp_cell, c2 );
}


/*
 *  stack-swap primitive
 */

primitive( "stack-swap", primitive_stack_swap );
function                 primitive_stack_swap(){
// Swap the top two values of the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length < 2 ){
    FATAL( "stack-swap, stack too short" );
    return;
  }
  swap_cell( target, target - 1 * ONE );
}


/*
 *  stack-swap-nice primitive
 */

primitive( "stack-swap-nice", primitive_stack_swap_nice );
function                      primitive_stack_swap_nice(){
// Swap the top values of the stack of an object, no error if stack is too short
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length < 2 )return;
  swap_cell( target, target - 1 * ONE );
}


/*
 *  stack-enter primitive
 */

const tag_stack_base  = tag( "stack-base" );
const tag_stack_limit = tag( "stack-limit" );
const tag_stack_top   = tag( "stack-top" );


primitive( "stack-enter", primitive_stack_enter );
function                  primitive_stack_enter(){
// Switch the current actor data stack with the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    FATAL( "stack-enter, empty stack" );
    return;
  }
  CSP += ONE;
  set( CSP, type_reference, tag_stack_base, ACTOR_data_stack );
  increment_object_ref_count( ACTOR_data_stack );
  ACTOR_data_stack = target;
  CSP += ONE;
  set( CSP, type_integer, tag_stack_limit, ACTOR_data_stack_limit );
  ACTOR_data_stack_limit = target + to_cell( area_size( target ) );
  CSP += ONE;
  set( CSP, type_integer, tag_stack_top, TOS );
  TOS = target + length * ONE;
}


primitive( "stack-leave", primitive_stack_leave );
function                  primitive_stack_leave(){
// Restore the current actor data stack using info from the control stack
  TOS = eat_reference( CSP );
  CSP -= ONE;
  ACTOR_data_stack_limit = eat_integer( CSP );
  CSP -= ONE;
  ACTOR_data_stack = eat_integer( CSP );
  CSP -= ONE;
}


/*
 *  data-stack-base primitive
 */

const tag_data_stack_base  = tag( "data-stack-base" );
const tag_data_stack_limit = tag( "data-stack-limit" );

primitive( "data-stack-base", primitive_data_stack_base );
function                      primitive_data_stack_base(){
  push_integer( ACTOR_data_stack );
  set_tos_name( tag_data_stack_base );
}


/*
 *  data-stack-limit primitive
 */

primitive( "data-stack-limit", primitive_data_stack_limit );
function                       primitive_data_stack_limit(){
  push_integer( ACTOR_data_stack_limit );
  set_tos_name( tag_data_stack_limit );
}


/*
 *  control-stack-base primitive
 */

const tag_control_stack_base  = tag( "control-stack-base" );

function primitive_control_stack_base(){
  push_integer( ACTOR_control_stack );
  set_tos_name( tag_control_stack_base );
}
primitive( "control-stack-base", primitive_control_stack_base );


/*
 *  control-stack-limit primitive
 */

const tag_control_stack_limit = tag( "control-stack-limit" );

function primitive_control_stack_limit(){
  push_integer( ACTOR_control_stack_limit );
  set_tos_name( tag_control_stack_limit );
}
primitive( "control-stack-limit", primitive_control_stack_limit );


/*
 *  grow-data-stack primitive
 */


primitive( "grow-data-stack", primitive_grow_data_stack );
function                      primitive_grow_data_stack(){
// When current actors data stack is more than 80% full, grow it
  const length = ACTOR_data_stack_limit - ACTOR_data_stack;
  const current_length = TOS - ACTOR_data_stack;
  // If less than 80% full, do nothing
  if( current_length < ( length * 100 ) / 80 ){
    return;
  }
  const new_length = length * 2;
  const new_stack = allocate_area( new_length * size_of_cell );
  if( new_stack == 0 ){
    FATAL( "grow-control-stack, out of memory" );
    return;
  }
  move_cells( ACTOR_data_stack, new_stack, length );
  free_area( ACTOR_data_stack );
  ACTOR_data_stack = new_stack;
  ACTOR_data_stack_limit = new_stack + new_length;
  TOS = new_stack + current_length;
}


/*
 *  grow-control-stack primitive
 */

primitive( "grow-control-stack", primitive_grow_control_stack );
function                         primitive_grow_control_stack(){
  // When current actors control stack is more than 80% full, grow it
  const length = ACTOR_control_stack_limit - ACTOR_control_stack;
  const current_length = CSP - ACTOR_control_stack;
  // If less than 80% full, do nothing
  if( current_length < ( length * 100 ) / 80 ){
    return;
  }
  const new_length = length * 2;
  const new_stack = allocate_area( new_length * size_of_cell );
  if( new_stack == 0 ){
    FATAL( "grow-control-stack, out of memory" );
    return;
  }
  move_cells( ACTOR_control_stack, new_stack, length );
  free_area( ACTOR_control_stack );
  ACTOR_control_stack = new_stack;
  ACTOR_control_stack_limit = new_stack + new_length;
  CSP = new_stack + current_length;
}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as a queue
 */

/*
 *  queue-push primitive
 */

primitive( "queue-push", primitive_queue_push );
function                 primitive_queue_push(){
  primitive_stack_push();
}


/*
 *  queue-length primitive
 */

primitive( "queue-length", primitive_queue_length );
function                   primitive_queue_length(){
  primitive_stack_length();
}


/*
 *  queue-pull primitive
 */

primitive( "queue-pull", primitive_queue_pull );
function                 primitive_queue_pull(){

  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value( TOS );
  clear( TOS );
  POP();
  const queue_length = value( queue );
  if( queue_length + 1 >= to_cell( area_size( queue ) ) ){
    FATAL( "queue-pull, queue overflow" );
    return;
  }
  // Make room for new element
  let ii;
  for( ii = queue_length ; ii > 0 ; ii-- ){
    move_cell( queue + ii * ONE, queue + ( ii + 1 ) * ONE );
  }
  // Push new element
  move_cell( POP(), queue + ONE );
}


/*
 *  queue-capacity primitive
 */

const tag_queue_capacity = tag( "queue-capacity" );

primitive( "queue-capacity", primitive_queue_capacity );
function                     primitive_queue_capacity(){
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value( TOS );
  clear( TOS );
  POP();
  const queue_capacity = to_cell( area_size( queue ) );
  push_integer( queue_capacity - 1 );
  set_tos_name( tag_queue_capacity );
}


/*
 *  queue-clear primitive
 */

primitive( "queue-clear", primitive_queue_clear );
function                       primitive_queue_clear(){
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value( TOS );
  clear( TOS );
  POP();
  const queue_length = value( queue );
  let ii;
  for( ii = 0 ; ii < queue_length ; ii++ ){
    clear( queue + ( ii + 1 ) * ONE );
  }
  set_value( queue, 0 );
}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as an array
 */

/*
 *  array-put primitive
 */

primitive( "array-put", primitive_array_put );
function                primitive_array_put(){
  const value_cell = TOS;
  const index_cell = TOS - ONE;
  check_de&&mand_integer( index_cell );
  const index = value( index_cell );
  const array_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_length = value( array );
  const array_capacity = to_cell( area_size( array ) );
  if( index < 0 || index >= array_capacity ){
    FATAL( "array-put, index out of range" );
    return;
  }
  move_cell( value_cell, array + ( index + 1 ) * ONE );
  if( index >= array_length ){
    set_value( array, index + 1 );
  }
  clear( array_cell );
  reset( value_cell );
  reset( index_cell );
  TOS -= 3 * ONE;
}


primitive( "array-get", primitive_array_get );
function                primitive_array_get(){
  const index_cell = TOS;
  check_de&&mand_integer( index_cell );
  const index = value( index_cell );
  const array_cell = TOS - ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_length = value( array );
  if( index < 0 || index >= array_length ){
    FATAL( "array-get, index out of range" );
    return;
  }
  reset( index_cell );
  copy_cell( array + ( index + 1 ) * ONE, TOS );
  clear( array_cell );
  TOS -= 2 * ONE;
}


/*
 *  array-length primitive
 */

const tag_array_length = tag( "array-length" );

primitive( "array-length", primitive_array_length );
function                   primitive_array_length(){
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_length = value( array );
  clear( array_cell );
  set( TOS, type_integer, tag_array_length, array_length );
}


/*
 *  array-capacity primitive
 */

const tag_array_capacity = tag( "array-capacity" );

primitive( "array-capacity", primitive_array_capacity );
function                     primitive_array_capacity(){
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_capacity = to_cell( area_size( array ) );
  clear( array_cell );
  set( TOS, type_integer, tag_array_capacity, array_capacity - 1 );
}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as a map
 */

/*
 *  map-put primitive
 */

primitive( "map-put", primitive_map_put );
function              primitive_map_put(){
  const value_cell = TOS;
  const name_id = name( value_cell );
  const map_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value( map_cell );
  const map_length = value( map );
  const map_capacity = to_cell( area_size( map ) );
  // Search for the key
  let ii = 0;
  while( ii < map_length ){
    if( name( map + ( ii + 1 ) * ONE ) == name_id ){
      break;
    }
    ii++;
  }
  if( ii == map_capacity ){
    FATAL( "map-put, map full" );
    return;
  }
  if( ii == map_length ){
    set_value( map, map_length + 1 );
  }
  move_cell( value_cell, map + ( ii + 1 ) * ONE );
  TOS -= 3 * ONE;
}


/*
 *  map-get primitive
 */

primitive( "map-get", primitive_map_get );
function              primitive_map_get(){
  const key_cell = TOS;
  de&&mand_tag( key_cell );
  const map_cell = TOS - ONE;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value( map_cell );
  const map_length = value( map );
  // Search for the key
  let ii = 0;
  while( ii < map_length ){
    if( name( map + ( ii + 1 ) * ONE ) == name( key_cell ) ){
      break;
    }
    ii++;
  }
  if( ii == map_length ){
    FATAL( "map-get, key not found" );
    return;
  }
  reset( key_cell );
  copy_cell( map + ( ii + 1 ) * ONE, TOS );
  clear( map_cell );
  TOS -= 2 * ONE;
}


/*
 *  map-length primitive
 */

const tag_map_length = tag( "map-length" );

primitive( "map-length", primitive_map_length );
function                 primitive_map_length(){
  const map_cell = TOS;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value( map_cell );
  const map_length = value( map );
  clear( map_cell );
  set( TOS, type_integer, tag_map_length, map_length );
  set_tos_name( tag_map_length );
}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the control stack local variables
 */

/*
 *  without-local primitive
 */

primitive( "without-local", primitive_without_local );
function                    primitive_without_local(){
// Clear control stack down to the specified control variable included
  const n = pop_tag();
  while( name( CSP ) != n ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "without-local, missing " + tag_to_text( n ) );
      return;
    }
  }
  clear( CSP );
  CSP -= ONE;
}


/*
 *  return-without-locals primitive
 */

primitive( "return-without-locals", primitive_return_without_locals );
function                            primitive_return_without_locals(){
// Return after a clear down to the local variable with sentinel included
  while( name( CSP ) != tag_with ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "return-without-locals, /with is missing" );
      return;
    }
  }
  IP = eat_integer( CSP );
  CSP -= ONE;
}


/*
 *  with-locals primitive
 */

const tag_return_without_locals = tag( "return-without-locals" );

// Cannot initialize here in C++, see init_globals()
let return_without_locals_definition = 0;
// = definition( tag_return_without_locals );


primitive( "with-locals", primitive_with_locals );
function                  primitive_with_locals(){
// Prepare for a run that may create local variables
  CSP += ONE;
  set( CSP, type_integer, tag_with, IP );
  CSP += ONE;
  set( CSP, type_integer, tag_with, tag_return_without_locals );
}


/* ----------------------------------------------------------------------------
 *  Methods calls & other calls with the it local variable
 */

/*
 *  return-without-it primitive
 */


const tag_run_with_it = tag( "run-with-it" );


primitive( "return-without-it", primitive_return_without_it );
function                        primitive_return_without_it(){
// Return after a clear down to the 'it' local variable included
  while( name( CSP ) != tag_it ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "without-it, 'it' is missing" );
      return;
    }
  }
  reset( CSP );
  CSP -= ONE;
  de&&mand( name( CSP ) == tag_run_with_it );
  IP = eat_integer( CSP );
  CSP -= ONE;
}


/*
 *  with-it primitive
 */

const tag_with_it           = tag( "with-it" );
const tag_return_without_it = tag( "return-without-it" );

// See init_globals() where this definition is set
let return_without_it_definition = 0;
// = definition( tag_return_without_it );


primitive( "with-it", primitive_with_it );
function              primitive_with_it(){
// Prepare for a call to a block that expects an 'it' local variable

  CSP += ONE;
  set( CSP, type_integer, tag_with, IP );

  CSP += ONE;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );

  // Block will return to the definition of return-without-it
  CSP += ONE;
  set(
    CSP,
    type_integer,
    tag_run_with_it,
    return_without_it_definition
  );

}


/*
 *  it primitive
 */

primitive( "it", primitive_it );
function         primitive_it(){
// Push the value of the it control variable onto the data stack
  let ptr = CSP;
  while( name( ptr ) != tag_it ){
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_control_stack ){
        FATAL( "Local variable 'it' not found" );
        return;
      }
    }
  }
  copy_cell( ptr, PUSH() );
}


/*
 *  it! primitive
 */

primitive( "it!", primitive_set_it );
function          primitive_set_it(){
// Change the value of the 'it' local variable
  let ptr = CSP;
  while( name( ptr ) != tag_it ){
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_control_stack ){
        FATAL( "Local variable 'it' not found" );
        return;
      }
    }
  }
  move_cell( POP(), ptr );
  set_name( ptr, tag_it );
}


/*
 *  run-method-by-name primitive
 */

primitive( "run-method-by-name", primitive_run_method_by_name );
function                         primitive_run_method_by_name(){
// Call method by name
  // ToDo: should check against a type_text
  const name_id = pop_tag();
  const auto_verb_name = tag_to_text( name_id );
  let target = TOS;
  const target_type = type( target );
  // ToDo: lookup using name of value ?
  let auto_target_class_name = tag_to_text( cell_class_tag( target ) );
  const auto_fullname = auto_target_class_name + "." + auto_verb_name;
  let verb_id = tag( auto_fullname );
  if( verb_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( verb_id == 0 ){
      // ToDo: lookup based on type, unless reference
      if( target_type != type_reference ){
        // ToDo: get type as text, then add : and method name
      }
      if( verb_id == 0 ){
        set_tag_cell( PUSH(), name_id );
        verb_id = tag_missing_method;
      }
    }
  }
  CSP += ONE;
  set( CSP, type_integer, name_id, IP );
  IP = definition( verb_id );
}


/*
 *  run-method-by-tag primitive
 */

primitive( "run-method-by-tag", primitive_run_method_by_tag );
function                        primitive_run_method_by_tag(){
  check_de&&mand_tag( TOS );
  // ToDo: should not reuse primitive as it is because it should expect a text
  primitive_run_method_by_name();
}


/*
 *  run-with-it primitive - like run but with an "it" local variable
 */

primitive( "run-with-it", primitive_run_with_it );
function                  primitive_run_with_it(){
  const block = pop_block();
  // Push normal return address onto control stack
  CSP += ONE;
  set( CSP, type_integer, tag_run_with_it, IP );
  // Push local variable 'it'
  CSP += ONE;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );
  // Push special return address to local variables cleaner
  CSP += ONE;
  set(
    CSP,
    type_integer,
    tag_return_without_it,
    return_without_it_definition
  );
  // Jump into block definition
  IP = block;
}


/* ---------------------------------------------------------------------------
 *  low level unsafe access to CSP, TOS & IP registers
 */

/*
 *  words_per_cell primitive
 */

const tag_words_per_cell = tag( "words-per-cell" );

primitive( "words-per-cell", primitive_words_per_cell );
function                     primitive_words_per_cell(){
  set( PUSH(), type_integer, tag_words_per_cell, ONE );
}


/*
 *  CSP primitive
 */

const tag_CSP = tag( "CSP" );

primitive( "CSP", primitive_CSP );
function          primitive_CSP(){
  set( PUSH(), type_integer, tag_CSP, CSP );
}


/*
 *  set-CSP primitive
 */

primitive( "set-CSP", primitive_set_CSP );
function              primitive_set_CSP(){
  CSP = pop_integer();
}


/*
 *  TOS primitive
 */

const tag_TOS = tag( "TOS" );

primitive( "TOS", primitive_TOS );
function          primitive_TOS(){
  const tos = TOS;
  set( PUSH(), type_integer, tag_TOS, tos );
};


/*
 *  set-TOS primitive
 */

primitive( "set-TOS", primitive_set_TOS );
function              primitive_set_TOS(){
  TOS = pop_integer();
};


/*
 *  IP primitive
 */

const tag_IP = tag( "IP" );

primitive( "IP", primitive_IP );
function         primitive_IP(){
  set( PUSH(), type_integer, tag_IP, IP );
}


/*
 *  set-IP primitive
 */

primitive( "set-IP", primitive_set_IP );
function             primitive_set_IP(){
  IP = pop_integer();
}


/* -----------------------------------------------------------------------
 *  runner, fast, execute Inox verbs
 */


const type_primitive = type_void;


/**/ function get_IP(){  return IP;  }
//c/ #define  get_IP()  IP

/**/ function get_CSP(){ return CSP; }
//c/ #define  get_CSP() CSP

/**/ function get_TOS(){ return TOS; }
//c/ #define  get_TOS() TOS

/**/ function set_IP(  v : Cell ){ IP  = v; }
//c/ #define  set_IP( v )  IP  = v

/**/ function set_CSP( v : Cell ){ CSP = v; }
//c/ #define  set_CSP( v ) CSP = v

/**/ function set_TOS( v : Cell ){ TOS = v; }
//c/ #define  set_TOS( v ) TOS = v

/**/ function push(){ return TOS += ONE; }
//c/ #define  push() ( TOS += ONE )

/**/ function pop(){  return TOS -= ONE; }
//c/ #define  pop()  ( TOS -= ONE )


/*!c{*/

class InoxExecutionContext {
  ip:      Function;  // The instruction pointer
  csp:     Function;  // top of control stack pointer
  tos:     Function;  // top of data stack pointer
  set_ip:  Function;  // Set the instruction pointer
  set_csp: Function;  // Set top of control stack pointer
  set_tos: Function;  // Set top of data stack pointer
  pop:     Function;  // Returns tos++
  push:    Function;  // Returns --tos
  run:     Function;  // Points to RUN()
}

const TheInoxExecutionContext = new InoxExecutionContext();


/**/ function init_the_execution_context(){
  const inox = TheInoxExecutionContext;
  inox.ip      = get_IP;
  inox.csp     = get_CSP;
  inox.tos     = get_TOS;
  inox.set_ip  = set_IP;
  inox.set_csp = set_CSP;
  inox.set_tos = set_TOS;
  inox.push    = push;
  inox.pop     = pop;
  inox.run     = RUN;
}

init_the_execution_context();

/*c*/


/**/ function SET_IP(  v ){ IP  = v; }
//c/ #define  SET_IP( v )  IP  = v
/**/ function SET_CSP( v ){ CSP = v; }
//c/ #define  SET_CSP( v ) CSP = v
/**/ function SET_TOS( v ){ TOS = v; }
//c/ #define  SET_TOS( v ) TOS = v


function PUSH() : Cell {
  de&&mand( TOS < ACTOR_data_stack_limit );
  return TOS += ONE;
}


function POP() : Cell {
  de&&mand( TOS > ACTOR_data_stack );
  return TOS--;
  // de&&mand( ONE == 1 );
  // If ONE is two, ie words_per_cell is 2, then it should be:
  // const x = TOS;
  // TOS -= ONE;
  // return x;
}


// Avoid infinite loops
let instructions_credit_increment = 100000;
let remaining_instructions_credit = instructions_credit_increment;
let instructions_total            = 0;
let must_stop                     = false;


/**/ de&&mand_eq( type_primitive, 0 );

/*!c{*/

function init_inox_execution_context(){
  // primitives have a limited access to the environment, but fast
  const inox = TheInoxExecutionContext;
  inox.ip  = function ip(){  return IP;  };
  inox.csp = function csp(){ return CSP; };
  inox.tos = function tos(){ return TOS; };
  // ToDo: gmp & tmp, global memory pointer and actor memory pointer
  // ToDo: act, current Act pointer
  inox.set_ip  = function set_ip(  v : Cell ){ IP  = v; };
  inox.set_csp = function set_csp( v : Cell ){ CSP = v; };
  inox.set_tos = function set_tos( v : Cell ){ TOS = v; };

  inox.push = function push(){
    // ToDo: check stack overflow?
    return TOS += ONE;
  };

  inox.pop = function pop(){
    // ToDo: check stack underflow?
    const x = TOS;
    TOS -= ONE;
    return x;
  }

  inox.run = RUN;
}



init_inox_execution_context();

/*}*/


function mand_stacks_are_in_bounds() : boolean {
  return mand_tos_is_in_bounds() && mand_csp_is_in_bounds();
}


function RUN(){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  stack_de&&mand_stacks_are_in_bounds();
  de&&mand( !! IP );

  /**/ let fun = no_operation;
  //c/ Primitive fun = 0;
  let i;
  let t;

  //c/ goto loop;
  //c/ break_loop: if( 0 )
  loop: while( true ){

    // ToDo: there should be a method to break this loop
    // There is one: set remainig_instructions_credit to 0
    // ToDo: interrupt/signal handlers should use that mechanism
    // if( must_stop )break;

    // ToDo: there should be a method to break this loop
    while( remaining_instructions_credit-- ){

      // ToDo: use an exception to exit the loop,
      // together with some primitive_exit_run()
      /**/ if( !IP )break loop;
      //c/ if( !IP )goto break_loop;

      i = info( IP );

      if( stack_de ){
        bug( S()
          + "\nRUN IP: "
          + inox_machine_code_cell_to_text( IP )
          + stacks_dump()
        );
      }else if( run_de ){
        bug( S()
          + "\nRUN IP: "
          + inox_machine_code_cell_to_text( IP )
        );
      }

if( step_de )debugger;

      // The non debug loop is realy short
      if( !de ){
        if( i == 0x0000 ){
          IP = eat_integer( CSP );
          CSP -= ONE;
          continue;
        }
        t = unpack_type( i );
        // If primitive
        if( t == type_primitive /* 0 */ ){
          IP += ONE;
          get_primitive( i )();
        // If Inox defined word
        }else if( t == type_verb ){
          CSP += ONE;
          set( CSP, type_integer, unpack_name( i ), IP + ONE );
          // I could use a cached new IP or set the value at compile time
          //   new_ip = value( cell );
          //   if( new_ip == 0 ){
          //     new_ip = definition_by_tag( unpack_name( i ) );
          //     set_value( IP, new_ip );
          //   }
          //   IP = new_ip;
          IP = definition( unpack_name( i ) );
        // If literal
        }else{
          stack_de&&mand_stacks_are_in_bounds();
          TOS += ONE;
          copy_cell( IP, TOS );
          IP += ONE;
        }
        continue;
      }

      // The debug mode version has plenty of checks and traces

      // Special "next" code, 0x0000, is a jump to the return address.
      if( i == 0x0000 ){
        if( run_de ){
          bug( S()
            + "run, return to " + C( IP )
            + " of " + tag_to_text( name( CSP ) )
          );
        }
        // ToDo: check underflow?
        IP = eat_integer( CSP );
        CSP -= ONE;
        continue;
      }

      // What type of code this is, primitive, Inox verb or literal
      t = unpack_type( i );

      // Call to another verb, the name of the cell names it
      if( t == type_verb ){
        // Push return address into control stack
        CSP += ONE;
        set( CSP, type_integer, unpack_name( i ), IP + ONE );
        // Store routine name also, cool for stack traces
        // ToDo: set type to Act?
        // ToDo: i could encode a verb to execute that would sometimes
        // do something more sophisticated that just change the IP.
        // ToDo: The indirection could be avoided.
        // ToDo: cache the address of the defininition into cell's value
        // ToDo: alternatively the cache could be precomputed by add_code()
        IP = definition( unpack_name( i ) );
        // bug( verb_to_text_definition( unpack_name( verb ) ) );
        continue;
      }

      // Call to a primitive, the name of the cell names it
      // ToDo: use a type instead of tricking the void type?
      if( t == type_void /* 0 */ ){

        IP += ONE;

        // Some debug tool to detect bad control stack or IP manipulations
        let verb_id = i;
        if( run_de && i != 61 ){  // quote is special

          let old_csp = CSP;
          let old_ip  = IP;

          if( get_primitive( i ) == no_operation ){
            FATAL(
              "Run. Primitive function not found for id " + N( i )
              + ", name " + tag_to_dump_text( verb_id )
            );
          }else{
            fun = get_primitive( i );
            fun();
          }

          if( CSP != old_csp
          && i != tag( "return" )
          && i != tag( "run" )
          && i != tag( "if" )
          && i != tag( "if-else" )
          && i != tag( "if-not" )
          && i != tag( "run-name" )
          && i != tag( "run-tag" )
          && i != tag( "run-method-by-name" )
          && i != tag( "while-1" )
          && i != tag( "while-2" )
          && i != tag( "while-3" )
          && i != tag( "until-3" )
          && i != tag( "loop" )
          && i != tag( "break" )
          && i != tag( "with-it" )
          && i != tag( "without-it" )
          && i != tag( "from-local" )
          && i != tag( "make-local" )
          && i != tag( "without-local" )
          && i != tag( "sentinel" )
          && i != tag( "jump" )
          && i != tag( "run-with-parameters" )
          && i != tag( "return-without-parameters" )
          && i != tag( "run-with-it" )
          && i != tag( "return-without-it" )
          && i != tag( "clear-control" )
          && i != tag( "clear-data" )
          && i != tag( "assert" )
          && i != tag( "assert-checker" )
          ){
            if( CSP < old_csp ){
              bug( S()
                + "??? small CSP, excess calls,"
                + N( ( old_csp - CSP ) / ONE )
              );
            }else{
              bug( S()
                + "??? big CSP, excess returns"
                + N( ( CSP - old_csp ) / ONE )
              );
            }
            de&&bug( S()
              + "Due to " + F( fun )
              + ", " + inox_machine_code_cell_to_text( old_ip )
            );
            debugger;
            // CSP = old_csp;
          }
          if( IP && IP != old_ip ){
            bug( S()
              + "run, IP change, was " + C( old_ip - ONE )
              + ", due to "
              + inox_machine_code_cell_to_text( old_ip - ONE )
            );
          }
          if( IP == 0 ){
            bug( S()+ "run, IP 0 due to " + F( fun ) );
            // break loop;  // That's not supposed to be a way to exit the loop
          }

        }else{
          fun = get_primitive( i );
          fun();
        }

        continue;
      }

      // Else, push literal
      check_de&&mand( TOS < ACTOR_data_stack_limit );
      TOS += ONE;
      copy_cell( IP, TOS );
      // ToDo: optimize by inlining copy_cell()
      // set_cell_value( TOS, cell_value( IP ) );
      // set_cell_info(  TOS, verb );
      // if( is_reference_cell( IP ) ){
      //   increment_object_refcount( cell_value( IP ) );
      // }
      IP += ONE;

    }  // while( credit-- > 0 )

    // Update total number of instructions
    // ToDo: I could estimate the speed and adjust the credit increment
    // ToDo: I could decrement the credit less frequently to reduce the
    // overhead of the credit check, on returns only for example.
    // This would ease pseudo premptive multitasking too.
    instructions_total
    += instructions_credit_increment - remaining_instructions_credit;
    remaining_instructions_credit = instructions_credit_increment;

  }  // until IP 0 or must stop

} // RUN()


const tag_eval = tag( "eval" );

/**/ function run_eval(){
//c/ void run_eval( void ){

  IP = definition_by_name( "eval" );
  de&&mand( !! IP );

  // Should return to here, hence IP 0
  CSP += ONE;
  set( CSP, type_integer, tag_eval, 0 );

  // ToDo: better checks for stacks overflow and underflow
  stack_de&&mand_stacks_are_in_bounds();

  RUN();

  // ToDo: better check for stacks overflow and underflow
  stack_de&&mand_stacks_are_in_bounds();

}


/* ----------------------------------------------------------------------------
 *  Aliases and dialects.
 *  An alias is an arbitray text that will replace the next token produced
 *  by the tokenizer. The new text is then scanned again to find the new next
 *  token. That new token can be aliased too, and so on.
 *  Dialects are a way to regroup multiple aliases under a common name space.
 *  In addition to aliases, each dialect define some special character sequences
 *  for the tokenizer, including the style of one liner and multiple lines
 *  comment and a few other things like "to" for verb definitions and the dot
 *  terminator, etc.
 */

// Name of current style, "inox" or "forth" typically
/**/ let  the_style = "";
//c/ Text the_style( "" );


// Typescript version uses a Map of Map objects
/*

// Each dialect has a map of alias to text.
let the_current_style_aliases = new Map< text, text >();
const all_aliases_by_style = new Map< text, Map< text, text > >();


function define_alias( style : text, alias : text, new_text : text ){
// Set the definition of an alias inside a dialect/style
  let aliases = aliases_by_style( style );
  aliases.set( alias, new_text );
}


function alias( a : text ){
// Get the potential aliased text for an alias in the durrent dialect/style.
  if( !  the_current_style_aliases.has( a ) )return "";
  return the_current_style_aliases.get( a );
}


function set_alias_style( style : text ){
  the_current_style_aliases = aliases_by_style( style );
}


function aliases_by_style( style : text ) : Map< text, text > {
  if( ! all_aliases_by_style.has( style ) ){
    // On the fly style creation
    return make_style( style );
  }
  return all_aliases_by_style.get( style );
}


function make_style( style : text ) : Map< text, text > {
// Add a new dialect/style, named.
  let new_map = new Map< text, text >();
  all_aliases_by_style.set( style, new_map );
  return new_map;
}


// New version uses stack from stack_preallocate()
*/

let the_current_style_aliases = 0;

// Each dialect has a map of alias to text
let all_aliases_by_style = stack_preallocate( 10 );


function make_style( style : TxtC ) : Cell {
  // Allocate an extensible stack
  let new_map = stack_preallocate( 100 );
  let new_tag = tag( style );
  set( the_tmp_cell, type_integer, new_tag, new_map );
  stack_push( all_aliases_by_style, the_tmp_cell );
  return new_map;
}


function aliases_by_style( style : TxtC ) : Cell {
  let style_tag = tag( style );
  // On the fly style creation
  if( !stack_contains_tag( all_aliases_by_style, style_tag ) ){
    make_style( style );
  }
  let aliases = stack_lookup_by_tag( all_aliases_by_style, style_tag );
  de&&mand_neq( aliases, 0 );
  return value( aliases );
}


function set_alias_style( style : TxtC ){
  the_current_style_aliases = aliases_by_style( style );
}


function define_alias( style : TxtC, alias : TxtC, new_text : TxtC ){
  let aliases = aliases_by_style( style );
  let alias_tag = tag( alias );
  if( !stack_contains_tag( aliases, alias_tag ) ){
    // ToDo: should reallocate stack if full
    set_text_cell( the_tmp_cell, new_text );
    set_name( the_tmp_cell, alias_tag );
    stack_push( aliases, the_tmp_cell );
    return;
  }
  let alias_cell = stack_lookup_by_tag( aliases, alias_tag );
  set_text_cell( alias_cell, new_text );
}


function alias( a : TxtC ) : Text {
// Get alias for some text in current dialect, or ""
  if( !stack_contains_name( the_current_style_aliases, a ) )return no_text;
  return cell_to_text( stack_lookup_by_name( the_current_style_aliases, a ) );
}


// Some predefined dialects/styles
let inox_style         = make_style( "inox"       );
let forth_aliases      = make_style( "forth"      );
let sh_aliases         = make_style( "sh"         );
let c_aliases          = make_style( "c"          );
let javascript_aliases = make_style( "javascript" );
let lisp_aliases       = make_style( "lisp"       );


/*
 *  inox-dialect primitive - switch to the Inox dialect
 */

function primitive_inox_dialect(){
  set_style( "inox" );
}
primitive( "inox-dialect", primitive_inox_dialect );



/*
 *  dialect primitive - query current dialect text name
 */

const tag_dialect = tag( "dialect" );

function primitive_dialect(){
  push_text( the_style );
  set_tos_name( tag_dialect );
}
primitive( "dialect", primitive_dialect );


/*
 *  forth-dialect primitive - switch to the Forth dialect
 */

primitive( "forth-dialect", primitive_forth_dialect );
function                    primitive_forth_dialect(){
  set_style( "forth" );
}


/*
 *  set-dialect primitive - set current dialect
 */

function primitive_set_dialect(){
  set_style( pop_as_text() );
}
primitive( "set-dialect", primitive_set_dialect );


/*
 *  alias primitive - add an alias to the current dialect
 */

function primitive_alias(){
  const auto_new_text = pop_as_text();
  const auto_old_text = pop_as_text();
  define_alias( the_style, auto_old_text, auto_new_text );
}
primitive( "alias", primitive_alias );


/*
 *  dialect-alias primitive - add an alias to a dialect
 */

function primitive_dialect_alias(){
  const auto_style    = pop_as_text();
  const auto_new_text = pop_as_text();
  const auto_old_text = pop_as_text();
  define_alias( auto_style, auto_old_text, auto_new_text );
}
primitive( "dialect-alias", primitive_dialect_alias );


/*
 *  import-dialect primitive - import a dialect into the current one
 */

function primitive_import_dialect(){
  const auto_imported_style = pop_as_text();
  const imported_dialect = aliases_by_style( auto_imported_style );
  // It is a stack, add all it's elements to the current dialect
  let ii = 0;
  while( ii < stack_length( imported_dialect ) ){
    let alias_cell = stack_at( imported_dialect, ii );
    let auto_alias = tag_to_text( name( alias_cell ) );
    let auto_alias_text = cell_to_text( alias_cell );
    define_alias( the_style, auto_alias, auto_alias_text );
    ii++;
  }
}
primitive( "import-dialect", primitive_import_dialect );


/* ----------------------------------------------------------------------------
 *  verb and block compilation related.
 */

// In that mode, Inox source code evaluator treats all verbs as if immediate.
let immediate_mode_level = 0;

// This is the id of the verb beeing defined or last defined
let the_last_defined_verb = 0;

let the_last_quoted_verb_id = 0;

// Last tokenized verb from the tokenizer. ToDo: use it
const the_last_token_cell = allocate_cell();

// ToDo: initialize the_last_token_cell in C++ somewhere
/**/ set_integer_cell( the_last_token_cell, 0 );
/**/ set_name(         the_last_token_cell, tag( "last-token" ) );


function primitive_enter_immediate_mode(){
  immediate_mode_level++;
}
immediate_primitive( "inox{", primitive_enter_immediate_mode );


function primitive_leave_immediate_mode(){
  de&&mand( !! immediate_mode_level );
  immediate_mode_level--;
}
immediate_primitive( "}inox", primitive_leave_immediate_mode );


/*
 *  literal primitive - add a literal to the Inox verb beeing defined,
 *  or to a block.
 */


function primitive_literal(){
  eval_do_literal();
}
primitive( "literal", primitive_literal );


/*
 *  machine-code primitive - add a machine code id to the verb beeing defined,
 *  or to a block.
 */

function primitive_do_machine_code(){
  eval_do_machine_code( pop_verb() );
}
primitive( "machine-code", primitive_do_machine_code );


/*
 *  inox primitive - add next token as code for the verb beeing defined,
 *  or to a block.
 */

function primitive_inox(){
// Read the next token from the source code input stream
// and get it's Inox verb code id. Defaults to 0 if next token in source
// is not a defined Inox verb.
// ToDo: could return a text instead of 0.
  eval_quote_next_token();
}
primitive( "inox", primitive_inox );


/*
 *  quote primitive - push next instruction instead of executing it.
 *  Must be inlined. It then move IP past the next instruction, ie it skips it.
 */

function primitive_quote(){
  let verb_id = name( IP );
  the_last_quoted_verb_id = verb_id;
  PUSH();
  raw_move_cell( IP, TOS );
  // Skip the quoted instruction
  IP += ONE;
}
primitive( "quote", primitive_quote );


/* -----------------------------------------------------------------------------
 *  Primitives to change the flags attached to a verb.
 */

/*
 *  immediate primitive - make the last defined verb immediate
 */

function primitive_immediate(){
  set_verb_immediate_flag( the_last_defined_verb );
}
primitive( "immediate", primitive_immediate );


/*
 *  hidden primitive - make the last defined verb hidden
 *  ToDo: implement this and definition linked lists
 */

function primitive_hidden(){
  set_verb_hidden_flag( the_last_defined_verb );
}
primitive( "hidden", primitive_hidden );


/*
 *  operator primitive - make the last defined verb an operator
 */

function primitive_operator(){
  set_verb_operator_flag( the_last_defined_verb );
}
primitive( "operator", primitive_operator );


/*
 *  inline primitive - make the last defined verb inline
 */

function primitive_inline(){
  set_inline_verb_flag( the_last_defined_verb );
}
primitive( "inline", primitive_inline );


/*
 *  last-token primitive - return the last tokenized item
 */

function primitive_last_token(){
  copy_cell( the_last_token_cell, PUSH() );
}
primitive( "last-token", primitive_last_token );


/*
 *  tag primitive - make a tag, from a text typically
 */

function primitive_tag(){
  const t = tag( cell_to_text( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_tag, t );
}
primitive( "tag", primitive_tag );


/*
 *  run-tag primitive - run a verb by tag
 */

function run_verb( verb_id : Index ){
  // Push return address onto control stack
  save_ip( verb_id );
  // Jump to verb definition, there is a "default" definition
  IP = definition( verb_id );
}


function primitive_run_tag(){
  run_verb( pop_tag() );
}
primitive( "run-tag", primitive_run_tag );


/*
 *  run-name primitive - run a verb by text name
 */

function primitive_run_name(){
  const tos = TOS;
  de&&mand_cell_type( tos, type_text );
  const auto_verb_name = cell_to_text( tos );
  clear( POP() );
  // ToDo: better error handling
  de&&mand( tag_exists( auto_verb_name ) );
  let verb_id = tag( auto_verb_name );
  run_verb( verb_id );
}
primitive( "run-name", primitive_run_name );


/*
 *  run-verb primitive - run a verb by verb id
 *  ToDo: unify with run-tag
 */

function primitive_run_verb(){
  de&&mand_cell_type( TOS, type_verb );
  const verb_id = eat_raw_value( TOS );
  run_verb( verb_id );
}
primitive( "run-verb", primitive_run_verb );


/*
 *  definition primitive - get the definition of a verb
 *  It returns the address of the first compiled code of the verb.
 *  There is a header in the previous cell, with length and flags.
 */


const tag_definition = tag( "definition" );


function primitive_definition(){
  const auto_verb_name = cell_to_text( TOS );
  clear( TOS );
  let verb_id;
  if( tag_exists( auto_verb_name ) ){
    verb_id = tag( auto_verb_name );
  }else{
    verb_id = 0;
  }
  const ip = definition( verb_id );
  set( TOS, type_integer, tag_definition, ip );
  de&&mand_block( TOS );
}
primitive( "definition", primitive_definition );

// ToDo: block-length & verb-flags


/*
 *  run primitive - run a block or a verb definition
 */

const tag_run = tag( "run" );

function primitive_run(){
  const block = pop_block();
  /**/ if( de && block < 2000 ){
  /**/   FATAL( "Not a block at " + block );
  /**/   return;
  /**/ }
  // Push return address onto control stack
  save_ip( tag_run );
  // Jump into definition
  IP = block;
}
primitive( "run", primitive_run );


/*
 *  run-definition primitive - run a verb definition
 */

function primitive_run_definition(){
  // "inox Hello run" does what Hello does alone
  const verb_id = pop_integer();
  // ToDo: check that it is a valid verb id
  save_ip( verb_id );
  IP = definition( verb_id );
}
primitive( "run-definition", primitive_run_definition );


/*
 *  block primitive - push the start address of the block at IP
 */


function block_length( ip : Cell ) : Count {
// Get the length of the block at ip
  check_de&&mand_eq( name( ip ), tag_block_header );
  const block_length = value( ip ) & 0xffff; // ToDo: block_length_mask?
  return block_length;
}


function block_flags( ip : Index ) : Index {
// Get the flags of the block at ip
  check_de&&mand_eq( name( ip ), tag_block_header );
  const block_flags = value( ip ) >> 16; // ToDo: block_flags_shift?
  return block_flags;
}


/*
 *  block primitive - push the start address of the block at IP.
 *  Must be inlined. It then advances IP to skip the block definition.
 */


function primitive_block(){
  // The block header is at IP, it's an integer
  check_de&&mand_integer( IP );
  // It's name is /block-header
  check_de&&mand_cell_name( IP, tag_block_header );
  let length = block_length( IP );
  // Push the address, skipping the block header
  PUSH();
  set( TOS, type_integer, tag_block, IP + 1 * ONE );
  // Advance IP to skip the block
  IP = IP + ( 1 + length ) * ONE;
  if( de ){
    // There should be a return opcode at the end of the block
    const previous_cell = IP - ONE;
    const previous_cell_value = value( previous_cell );
    const previous_cell_type  = type(  previous_cell );
    const previous_cell_name  = name(  previous_cell );
    de&&mand_eq( previous_cell_value, 0 );
    de&&mand_eq( previous_cell_type, type_void );
    de&&mand_eq( previous_cell_name, 0x0 ); // tag_return );
    //if( previous_cell_name != tag( "void" ) ){
    //  bug( S()+ "Bad opcode, not void, " + tag_to_text( previous_cell_name))
    //}
    //de&&mand_eq( previous_cell_name, tag( "void" ) );
  }
}
primitive( "block", primitive_block );


/* -----------------------------------------------------------------------
 *  Tokenizer
 */

/*
 *  types of tokens & of tokenizer states
 */

/**/ const token_base               = 0;
//c/ #define token_base               0
/**/ const token_type_word          = 1;
//c/ #define token_type_word          1
/**/ const token_type_number        = 2;
//c/ #define token_type_number        2
/**/ const token_type_text          = 3;
//c/ #define token_type_text          3
/**/ const token_type_comment       = 4;
//c/ #define token_type_comment       4
/**/ const token_comment_multiline  = 5;
//c/ #define token_comment_multiline  5
/**/ const token_type_eof           = 6;
//c/ #define token_type_eof           6
/**/ const token_type_indent        = 7;
//c/ #define token_type_indent        7
/**/ const token_type_error         = 8;
//c/ #define token_type_error         8


function token_type_to_text( type : Index ) : Text {
  switch( type ){
    case token_base:               return "token_base";
    case token_type_word:          return "token_word";
    case token_type_number:        return "token_number";
    case token_type_text:          return "token_text";
    case token_type_comment:       return "token_comment";
    case token_comment_multiline:  return "token_comment_multiline";
    case token_type_eof:           return "token_eof";
    case token_type_indent:        return "token_indent";
    case token_type_error:         return "token_error";
    default:                       return "token_???";
  }
}


let tag_token_base               = tag( "token_base" );
let tag_token_word               = tag( "token_word" );
let tag_token_number             = tag( "token_number" );
let tag_token_text               = tag( "token_text" );
let tag_token_comment            = tag( "token_comment" );
let tag_token_comment_multiline  = tag( "token_comment_multiline" );
let tag_token_eof                = tag( "token_eof" );
let tag_token_indent             = tag( "token_indent" );
let tag_token_error              = tag( "token_error" );


function token_type_to_tag( type : Index ) : Tag {
  switch( type ){
    case token_base:               return tag_token_base;
    case token_type_word:          return tag_token_word;
    case token_type_number:        return tag_token_number;
    case token_type_text:          return tag_token_text;
    case token_type_comment:       return tag_token_comment;
    case token_comment_multiline:  return tag_token_comment_multiline;
    case token_type_eof:           return tag_token_eof;
    case token_type_indent:        return tag_token_indent;
    case token_type_error:         return tag_token_error;
    default:                       return tag_token_error;
  }
}


function token_tag_to_type( t : Tag ) : Index {
  if( t == tag_token_base )               return token_base;
  if( t == tag_token_word )               return token_type_word;
  if( t == tag_token_number )             return token_type_number;
  if( t == tag_token_text )               return token_type_text;
  if( t == tag_token_comment )            return token_type_comment;
  if( t == tag_token_comment_multiline )  return token_comment_multiline;
  if( t == tag_token_eof )                return token_type_eof;
  if( t == tag_token_indent )             return token_type_indent;
  if( t == tag_token_error )              return token_type_error;
  return token_type_error;
}


/*!c{*/

abstract class TextStreamIterator {
  // Get next text to tokenize. REPL would readline() on stdin typically
  abstract next() : Text;
}

/*c*/


// When REPL, source code comes from some readline() function
/**/ let toker_stream  : TextStreamIterator;
//c/ static int toker_stream = 0;

// Source that is beeing tokenized
/**/ let  toker_text = "";
//c/ static Text toker_text(  "" );

// Length of the source
let toker_text_length = 0;

// Current position in the source
let toker_text_cursor = 0;

// Current line number
let toker_line_no = 0;

// Current column number
let toker_column_no = 0;

// Current position in the source for aliased word
let toker_alias_cursor = 0;

// When set, whitespaces are the only separators, as in Forth
// This is activated after a "to" to get the verb name.
let toker_eager_mode = false;

// One token ahead sometime, see unget_token()
let back_token_type = 0;

// The text value of that back token
/**/ let  back_token_text = "";
//c/ static Text back_token_text(  "" );

// ToDo: about xxxx:name stuff, weird, explain
/**/ let  toker_post_literal_name = "";
//c/ static Text toker_post_literal_name(  "" );

// Indentation based definitions and keywords auto close
let toker_indentation = 0;

// To detect indentation changes
let toker_previous_indentation;

// Flag to detect indentation level
let toker_indentation_reached  = false;

// The last seen token or beeing processed one
let token_type = 0;

// The text value of that token
/**/ let token_text = "";
//c/ static Text token_text(  "" );

// The position of that token in the source
let token_position = 0;

// The line number of that token in the source
let token_line_no = 0;

// The column number of that token in the source
let token_column_no = 0;

// "to" when Inox style, "," when Forth style
/**/ let  begin_define = "";
//c/ static Text begin_define( "" );

// "." when Inox style, ";" when Forth style
/**/ let  end_define = "";
//c/ static Text end_define(  "" );

// For keyword, ";" when Inox style
/**/ let  terminator_sign = ";";
//c/ static Text terminator_sign(  ";" );

// Experimental Inox literate style
let is_literate = false;

// Comment detection related

// "~~" when Inox style
/**/ let  comment_monoline = "";
//c/ static Text comment_monoline(  "" );

// First ch of comment_monoline
/**/ let comment_monoline_ch0 = "";
//c/ static char comment_monoline_ch0 = 0;

// "~|" when Inox style
/**/ let comment_multiline_begin = "";
//c/ static Text comment_multiline_begin( "" );

// "|~" when Inox style
/**/ let  comment_multiline_end = "";
//c/ static Text comment_multiline_end(  "" );

// First ch of comment_multiline_begin
/**/ let comment_multiline_ch0 = "";
//c/ static char comment_multiline_ch0 = 0;

// Last ch of comment_multiline_end
/**/ let comment_multine_last_ch  = "";
//c/ static char comment_multine_last_ch = 0;
/**/ let no_ch = "";
//c/ static char no_ch = 0;

// For style/dialect auto detection
let first_comment_seen = false;


function set_comment_multi_line( begin : TxtC, end : TxtC ){
  comment_multiline_begin = begin;
  comment_multiline_ch0 = tlen( begin ) > 0 ? begin[ 0 ] : no_ch;
  comment_multiline_end = end;
  comment_multine_last_ch = tlen( end ) > 0 ? end[ tlen( end ) - 1 ] : no_ch;
}


function set_comment_mono_line( begin : TxtC ){
  comment_monoline = begin;
  comment_monoline_ch0 = tlen( begin ) > 0 ? begin[ 0 ] : no_ch;
  set_comment_multi_line( no_text, no_text );
}


function set_style( new_style : TxtC ){
// Set the new style for future tokens detections

  set_alias_style( new_style );

  if( teq( new_style, "inox" ) ){
    set_comment_mono_line( "~~" );
    set_comment_multi_line( "~|", "|~" );
    // Using "to" is Logo style, it's turtles all the way down
    begin_define = "to";
    end_define = ".";

  }else if( teq( new_style, "c" )
  ||        teq( new_style, "javascript" )
  ){
    set_comment_mono_line( "//" );
    set_comment_multi_line( "/*", "*/" );
    if( teq( new_style, "javascript" ) ){
      begin_define = "function";
      end_define = "}";
    }

  }else if( teq( new_style, "sh" ) ){
    set_comment_mono_line( "#" );
    // There is no standard, let's invent something
    set_comment_multi_line( "<<____", "____" );
    begin_define = "function";
    end_define = "}";

  }else if( teq( new_style, "forth" ) ){
    set_comment_mono_line( "\\" );
    set_comment_multi_line( "(", ")" );
    begin_define = ":";
    end_define = ";";

  }else if( teq( new_style, "lisp" ) ){
    set_comment_mono_line( ";" );
    set_comment_multi_line( "#|", "|#" );
    begin_define = "defn";
    end_define = ")"; // ToDo: this probably doesn't work

  }else if( teq( new_style, "prolog" ) ){
    set_comment_mono_line( "%" );
    set_comment_multi_line( "/*", "*/" );
    begin_define = "clause";
    end_define = ".";
  }

  the_style = new_style;

  // Don't guess the style because user made it explicit
  first_comment_seen = true;

}


function tokenizer_set_literate_style( is_it : boolean ){
  is_literate = is_it;
}


/**/ function tokenizer_set_stream( s : TextStreamIterator ){
//c/ void     tokenizer_set_stream( int s ) {
  toker_stream = s;
}


function tokenizer_restart( source : TxtC ){

  // The source code to process.
  /**/ toker_stream = null;
  toker_text        = source;
  toker_text_length = tlen( source );

  // Track progress in the source code
  toker_text_cursor = 0;
  toker_line_no     = 1;
  toker_column_no   = 0;

  // Default style
  set_style( "inox" );

  // First char of source code defines style of comments and aliases
  first_comment_seen = false;

  // Obviously there is no previously detected token to deliver
  back_token_type = 0;

  // Idem for the past literal name
  toker_post_literal_name = "";

  // Idem regarding indentation, restart fresh
  toker_indentation = 0;
  toker_previous_indentation = 0;
  toker_indentation_reached = false;

  // ToDo: make it reentrant
  // some enter/leave logic could stack the tokenizer state

}


/*
 *  start-input primitive - start reading from a given source code
 */

function primitive_inox_start_input(){
  tokenizer_restart( cell_to_text( TOS ) );
  clear( POP() );
}
primitive( "start-input", primitive_inox_start_input );


/*
 *  input primitive - get next character in source code, or ""
 */

function tokenizer_next_character() : Text {
// Get/consume next character and advance cursor, or ""
  // ToDo: handle stream
  if( toker_text_cursor >= toker_text_length )return "";
  /**/ const ch = toker_text[        toker_text_cursor++ ];
  //c/ Text  ch = toker_text.substr( toker_text_cursor++, 1 );
  return ch;
}


function primitive_inox_input(){
  push_text( tokenizer_next_character() );
}
primitive( "input", primitive_inox_input );


/*
 *  input-until primitive - get characters until a given delimiter
 */

const tag_token = tag( "token" );

function primitive_input_until(){
  const tos = TOS;
  let auto_limit = cell_to_text( tos );
  clear( tos );
  let auto_buf = S();
  let auto_ch  = S();
  while( true ){
    auto_ch = tokenizer_next_character();
    if( teq( auto_ch, "" ) ){
      // Return void if source is empty
      clear( tos );
      return;
    }
    if( teq( auto_ch, auto_limit ) ){
      set_text_cell( tos, auto_buf );
      set_name( tos, tag_token );
      return;
    }
    auto_buf += auto_ch;
  }
}
primitive( "input-until", primitive_input_until );


/*
 *  pushback-token primitive - push back a token in source code stream
 */

function unget_token( t : Index, s : Text ){
  back_token_type = t;
  back_token_text = s;
}


function primitive_pushback_token(){
  const cell = POP();
  const n = name( cell );
  // ToDo: should handle the token type properly
  const typ = token_tag_to_type( n );
  unget_token( typ, cell_to_text( cell ) );
  clear( cell );
}
primitive( "pushback-token", primitive_pushback_token );


function ch_is_space( ch : Text ) : boolean {
  // ToDo: faster
  return teq( ch, "\n" )
  ||     teq( ch, "\r" )
  ||     teq( ch, "\t" )
  ||     teq( ch, " " );
}


/*
 *  whitespace? primitive - true if TOS is a whitespace character
 */

const tag_is_whitespace = tag( "whitespace?" );


primitive( "whitespace?", primitive_inox_is_whitespace );
function                  primitive_inox_is_whitespace(){
// True if the text top of stack is a whitespace character
  de&&mand_cell_type( TOS, type_text );
  const auto_txt = cell_to_text( TOS );
  clear( POP() );
  push_boolean( ch_is_space( auto_txt ) );
  set_tos_name( tag_is_whitespace );
}


/*
 *  next-character primitive - get next character in source code, or ""
 */

const tag_next_character = tag( "next-character" );


function primitive_next_character(){
  const auto_ch = tokenizer_next_character();
  push_text( auto_ch );
  set_tos_name( tag_next_character );
}
primitive( "next-character", primitive_next_character );


/*
 *  digit? primitive - true if the top of stack is a digit character
 */

const tag_is_digit = tag( "digit?" );

function ch_is_digit( ch : TxtC ) : boolean {
  // ToDo: avoid regexp
  /**/ return /\d/.test( ch.charAt( 0 ) );
  //c/ return isdigit( ch[ 0 ] );
}


function primitive_is_digit(){
  de&&mand_cell_type( TOS, type_text );
  const auto_txt = cell_to_text( TOS );
  clear( POP() );
  push_boolean( ch_is_digit( auto_txt ) );
  set_tos_name( tag_is_digit );
}
primitive( "digit?", primitive_is_digit );


/*
 *  eol? primitive
 */

const tag_is_eol = tag( "eol?" );


function ch_is_eol( ch : Text ) : boolean {
  // ToDo: handle crlf better
  if( tneq( ch, "\n" ) && tneq( ch, "\r" ) )return false;
  return true;
}


function primitive_inox_is_eol(){
  de&&mand_cell_type( TOS, type_text );
  const auto_t = cell_to_text( TOS );
  clear( POP() );
  push_boolean( ch_is_eol( auto_t ) );
  set_tos_name( tag_is_eol );
}
primitive( "eol?", primitive_inox_is_eol );


/*
 *  next-token primitive
 */

const tag_word_token              = tag( "word-token"               );
const tag_number_token            = tag( "number-token"             );
const tag_text_token              = tag( "text-token"               );
const tag_comment_token           = tag( "comment-token"            );
const tag_multiline_comment_token = tag( "multiline-comment-token"  );
const tag_eof_token               = tag( "eof-token"                );
const tag_indentation_token       = tag( "indentation-token"        );
const tag_error_token             = tag( "error-token"              );


function primitive_next_token(){
// Get next token in source code, or void

  push_text( token_text );

  switch( token_type ){

    case token_type_word :
      set_tos_name( tag_word_token );
    break;

    case token_type_number :
      set_tos_name( tag_number_token );
    break;

    case token_type_text :
      set_tos_name( tag_text_token );
    break;

    case token_type_comment :
      set_tos_name( tag_comment_token );
    break;

    case token_comment_multiline :
      set_tos_name( tag_multiline_comment_token );
    break;

    case token_type_eof :
      set_tos_name( tag_eof_token );
    break;

    case token_type_indent :
      set_tos_name( tag_indentation_token );
    break;

    case token_type_error :
      set_tos_name( tag_error_token );
    break;

    default :
      set_tos_name( tag_error_token );
    break;

  }

}
primitive( "next-token", primitive_next_token );


function extract_line( txt : TxtC, ii : Index ) : Text {
// Extract the line surrounding the position ii in text
  // Handle negative indices
  if( ii < 0 ){
    ii = tlen( txt ) + ii;
  }
  // Extract the line containing the token.
  let auto_line_extract = S();
  // Cut whatever is after next eol
  let auto_part = tbut( txt, ii );
  let index = tidx( auto_part, "\n" );
  if( index != -1 ){
    auto_line_extract = tcut( auto_part, index );
  }else{
    auto_line_extract = auto_part;
  }
  // Add whatever is before, up to previous eol
  auto_part = tcut( txt, ii );
  index = tidxr( auto_part, "\n" );
  if( index != -1 ){
    auto_line_extract = tbut( auto_part, index + 1 )
    + "[TOKEN]"
    + auto_line_extract;
  }else{
    auto_line_extract = S()+ "[TOKEN]" + auto_line_extract;
  }
  if( tlen( auto_line_extract ) > 70 ){
    auto_line_extract = tcut( auto_line_extract, 70 ) + "...";
  }
  return auto_line_extract;
}


function ch_is_limit( ch : TxtC, next_ch : TxtC ) : boolean {
  if( teq( ch, " " ) )return true;
  if( toker_eager_mode )return false;
  if( tneq( the_style, "inox" ) )return false;
  if( teq( ch, ":" )
  ||  ( teq( ch, ";" ) ) // ToDo: ?
  ||  ( teq( ch, "/" ) && tneq( next_ch, "(" ) ) // /a/b/c is /a /b /c, a/b/c is a/ b/ c
//||  ch == "^"  // ToDo: ?
//||  ch == "."  // ToDo: notation where x .b( c ) eqv c x .:b eqv c x /b .:
//||  ch == "'"  // ToDo: xxx'yyy eqv xxx.yyy ?  _point'x _point'out()
//||  ch == "`"  // ToDo: back tick for Lisp like quote ?
  || ( teq( ch, "(" ) && teq( next_ch, ")" ) ) // x() is x( and then )
  ){
    return true;
  }else{
    return false;
  }
}


// Some small lookahead to detect some constructs
/**/ let  next_ch  = "    ";
//c/ static Text next_ch( "    " );
let next_ch_ii = 0;



function refill_next_ch( ii : Index ){
  // Don't do it twice if same location
  if( next_ch_ii == ii )return;
  let jj;
  next_ch = "";
  for( jj = 0 ; jj < 4 ; jj++ ){
    if( ( ii + jj ) >= toker_text_length ){
      next_ch += " ";
    }else{
      /**/ next_ch += toker_text[ ii + jj ];
      //c/ next_ch += tmid( toker_text, ii + jj, 1 );
      // Treat lf like a space
      if( ch_is_eol( tmid( next_ch, jj, 1 ) ) ){
        next_ch = tcut( next_ch, jj ) + " ";
      }
    }
  }
  next_ch_ii = ii;
}


function handle_literate_style( buf : TxtC ) : Text {

  // See https://github.com/cognate-lang/cognate

  // ToDo: this assert fails, why? de&&mand( buf.length > 0 );

  if( !is_literate )return buf;
  if( teq( buf, "." ) )debugger;

  // If word does not depend on case, leave it alone, not a comment
  if( teq( tlow( buf ), tup( buf ) ) )return buf;

  // If the word is one letter long then it's a comment
  if( tlen( buf ) < 2 ){
    token_type = token_type_comment;
    return buf;
  }

  // In literate style, lower/upper case is significant on first 2 letters
  /**/ const first_ch  = buf[ 0 ];
  //c/ Text  first_ch( "" );  first_ch  +=  buf[ 0 ];
  /**/ const second_ch = buf[ 1 ];
  //c/ Text  second_ch( "" ); second_ch +=  buf[ 1 ];

  // If word starts with two lower case letters, then it is a comment
  if( teq( tlow( first_ch ),  first_ch )
  &&  teq( tlow( second_ch ), second_ch )
  ){
    token_type = token_type_comment;
    return buf;
  }

  // If word starts with 2 upper case letters, then it is code, as is
  if( teq( tup( first_ch ),  first_ch )
  &&  teq( tup( second_ch ), second_ch )
  ){
    return buf;
  }

  // It's code, but change uppercase first letter to lower case
  if( teq( tup( first_ch ), first_ch ) ){
    return tlow( first_ch ) + tbut( buf, 1 );
  }

  // It's code, leave it alone
  return buf;

}


// Globals for the tokenizer
let toker_ii = 0;
/**/ let  toker_ch = "";
//c/ static Text toker_ch( "" );
let toker_is_eol = false;
let toker_is_eof = false;
let toker_previous_ii = 0;
let token_is_ready = false;
let toker_is_space = false;
let toker_front_spaces = 0;
let toker_state = 0;
/**/ let  toker_buf = "";
//c/ static Text toker_buf( "" );
let style_is_forth = false;
let toker_start_ii = 0;
let toker_is_limit = false;
let toker_previous_state = 0;


/* -----------------------------------------------------------------------------
 *  An efficient getline() function.
 *  It uses file descriptors instead of FILE*.
 *  It is synchronous however, blocking the whole process.
 *  It is not thread safe.
 *  There is no dynamic memory involved and that comes with a limit to the
 *  line length, MAX_LINE_LENGTH, which is 2048, as per POSIX minimum.
 *  ToDo: make it thread safe.
 *  ToDo: make it asynchronous.
 *  ToDo: have a dynamic buffer when asked.
 *  ToDo: configure the max length.
 *  ToDo: configure the new line delimiter.
 *  This is implemented in C++ to avoid using the C runtime.
 *  ToDo: a TypeScript version that would also be compatible with
 *  AssemblyScript
 */

/*c{

#ifdef _WIN32
  #include <Windows.h>
#else
  #include <unistd.h>
#endif

// The buffer. 2048 is the minimum to be POSIX compliant
#define MAX_LINE_LENGTH 2048

// The buffer, static. ToDo: not thread safe
// +2 is for potential \n and \0 at the end
static char getline_buf[ MAX_LINE_LENGTH + 2 ];

// How many chars are still available in the buffer
static int getline_buf_length = 0;

// Where is the first available char in the buffer
static char* getline_buf_ptr = NULL;

// What file descriptor is the buffer for
static int getline_fd = -1;

static bool getline_is_tty = false;

// A saved char, needed when nulls are inserted after newlines
static int getline_safe_char = -1;

void fast_getline_close( int fd ){
// Should be called by the entity that opened the fd
  // Ignore if not about the current file descriptor
  if( fd >= 0 && fd != getline_fd )return;
  getline_buf_length = 0;
  getline_buf_ptr = getline_buf;
  *getline_buf = 0;
  getline_fd = -1;
  getline_safe_char = 0;
}


void fast_getline_open( int fd ){
// Should be called by the entity that opened the fd
  // Close the current file descriptor, if any
  fast_getline_close( getline_fd );
  getline_fd = fd;
  if( getline_fd < 0 )return;
  // Is it a TTY?

}


char* fast_getline_remainder(){
// Return whatever remains in the buffer, with \n and \0
  if( getline_buf_length <= 0 )return NULL;
  // Add a \n
  getline_buf[ getline_buf_length ] = '\n';
  // Add a \0
  getline_buf[ getline_buf_length + 1 ] = 0;
  char* result = getline_buf_ptr;
  getline_buf_length = 0;
  getline_buf_ptr = getline_buf;
  return result;
}


char* fast_getline( int fd ){

  // The result
  char* result = NULL;

  // If not the same fd, flush the buffer
  if( fd != getline_fd ){
    fast_getline_close( getline_fd );
    fast_getline_open( fd );
  }

  // If invalid fd, return null
  if( fd < 0 ){
    return NULL;
  }

  // Remember the fd
  getline_fd = fd;

  // Restore the saved char if needed
  if( getline_safe_char >= 0 ){
    *getline_buf_ptr = getline_safe_char & 0xff;
    getline_safe_char = -1;
  }

  // Look for the first newline
  char* nl = strchr( getline_buf_ptr, '\n' );
  result = getline_buf_ptr;

  // Found it, return the line
  if( nl ){
    // Update the length
    getline_buf_length -= nl - getline_buf_ptr;
    // Change next char into a null but save it first
    getline_buf_ptr = nl + 1;
    getline_safe_char = *getline_buf_ptr;
    *getline_buf_ptr = 0;
    return result;
  }

  // No newline, refill the buffer

  // First move what remains to the front, including the null terminator
  memmove( getline_buf, getline_buf_ptr, getline_buf_length + 1 );
  getline_buf_ptr = getline_buf;
  result = getline_buf;

  // Then try to fill the rest
  int more_length = 0;

  // Unless the buffer is full?
  if( getline_buf_length >= MAX_LINE_LENGTH ){
    // If so, it's a line that is too big, file is unfit to proceed
    fast_getline_close( getline_fd );
    return NULL;
  }

  // If this is a TTY then read one char at a time, until a newline
  if( getline_is_tty ){
    while( true ){
      more_length = read( fd, getline_buf + getline_buf_length, 1 );
      if( more_length <= 0 )break;
      getline_buf_length += more_length;
      if( getline_buf[ getline_buf_length - 1 ] == '\n' )break;
      // Don't overflow
      if( getline_buf_length >= MAX_LINE_LENGTH )break;
    }

  // If not a TTY, read as much as possible
  }else{
    more_length = read(
      fd,
      getline_buf + getline_buf_length,
      MAX_LINE_LENGTH - getline_buf_length
    );
  }

  // Some error or nothing?
  if( more_length <= 0 ){
    // On error, don't return an invalid line
    if( more_length < 0 ){
      fast_getline_close( getline_fd );
      return NULL;
    }
    // Assume EOF, return last line, with added \n if necessary
    result = fast_getline_remainder();
    // If empty, close and return null
    if( !result ){
      fast_getline_close( getline_fd );
    }
    // Otherwise return what we have
    return result;
  }

  // Make sure new content is null terminated
  getline_buf[ getline_buf_length + more_length ] = 0;

  // Retry, it should work this time
  result = fast_getline( fd );
  de&&mand_neq( (int) result, NULL );
  return result;

}

}*/


function process_whitespaces(){
  // EOF, end of file
  if( toker_ii == toker_text_length ){
    // If there is a stream, try to get more text from it
    if(
      /**/ toker_stream
      //c/ toker_stream >= 0
    ){
      /**/ const more_text = toker_stream.next();
      /*c{
        Text more_text( fast_getline( toker_stream ) );
      /*c*/
      if( more_text != "" ){
        toker_text = more_text;
        toker_text_length = tlen( more_text );
        /**/ toker_ch = more_text[ 0 ];
        //c/ toker_ch = more_text.substr( 0, 1 );
        toker_ii = 1;
        toker_previous_ii = 0;
      }else{
        toker_is_eof = true;
      }
    }else{
      toker_is_eof = true;
    }
    if( toker_is_eof && toker_state != token_type_word && toker_state != token_type_comment ){
      token_type = token_type_eof;
      token_is_ready = true;
      return;
    }
    // Simulate a space to end the current word
    toker_ch = " ";

  // Get next character in source
  }else{
    /**/ toker_ch = toker_text[ toker_ii++ ];
    //c/ toker_ch = toker_text.substr( toker_ii++, 1 );
  }

  // Is it some space or something equivalent?
  toker_is_space = ch_is_space( toker_ch );
  toker_is_eol   = ch_is_eol(   toker_ch );

  // Normalize all whitespaces into a single space character
  if( toker_is_space && toker_state != token_type_comment && toker_state != token_type_text ){
    toker_ch = " ";
  }

  // If end of line, detect it
  if( toker_is_eol ){
    // Line numbering, don't double when \r\n
    if( toker_ch != "\r" ){
      toker_line_no++;
    }
    // Restart indentation detection
    toker_front_spaces = 0;
    toker_indentation_reached = false;
    // Process eol as if it were a space
    toker_ch = " ";
    toker_is_space = true;

  // Count front spaces on new line to detect changed indentation
  }else if( ! toker_indentation_reached ){
    if( toker_is_space ){
      toker_front_spaces++;
    // If first non space on new line, emit some indentation token
    }else{
      toker_indentation_reached = true;
      // Emit either "++", "--" or "==" indentation token
      if( toker_state == token_base ){
        token_type = token_type_indent;
        if( toker_front_spaces > toker_indentation ){
          token_text = "++";
        }else if( toker_front_spaces < toker_indentation ){
          token_text = "--";
        }else{
          token_text = "==";
        }
        token_column_no = toker_front_spaces;
        toker_previous_indentation = toker_indentation;
        toker_indentation = toker_front_spaces;
        toker_column_no = toker_front_spaces; // ToDo: needs updates
        // Make sure first non space is processed normally next time
        toker_ii--;
        token_is_ready = true;
      }
    }
  }
} // process_whitespaces()




function process_base_state(){

  // skip whitespaces, including separators
  // ToDo: handle separator sign ("," if Inox) with more semantic
  if( toker_is_space ){
    return;
  }

  // Texts start with ", unless Forth
  // ToDo: make it configurable?
  if( teq( toker_ch, "\"" ) && !style_is_forth ){
    // ToDo: handle single quote 'xx' and backquote `xxxx`
    // ToDo: handle template text literals, ie fmt"..."
    toker_start_ii = toker_ii;
    toker_state = token_type_text;
    return;
  }

  // Comments start differently depending on style
  toker_buf += toker_ch;
  de&&mand( tlen( toker_buf ) > 0 );

  // If literate style, a line starting without indentation is a comment
  if( is_literate
  &&  toker_indentation_reached
  &&  toker_indentation == 0
  ){
    toker_state = token_type_comment;
    // The new ch will be added when processing the comment state
    toker_buf = tcut( toker_buf, -1 );
    toker_start_ii = toker_ii;
    toker_state = token_type_comment;
    process_comment_state();
    return;
  }

  // If actual start of comment, change state
  if( teq( toker_buf, comment_monoline )
  ||  teq( toker_buf, comment_multiline_begin )
  ){
    // The new ch will be added when processing the comment state
    toker_buf = tcut( toker_buf, -1 );
    toker_start_ii = toker_ii;
    toker_state = token_type_comment;
    process_comment_state();
    return;
  }

  // If potential start of comment, keep eating
  if( teq( toker_buf, comment_monoline_ch0 )
  ||  teq( toker_buf, comment_multiline_ch0 )
  ){
    return;
  }

  // Clear buf but keep the false start of comment if any
  if( teq( tcut( toker_buf, 1 ), comment_monoline_ch0 )
  ||  teq( tcut( toker_buf, 1 ), comment_multiline_ch0 )
  ){
    toker_buf = tcut( toker_buf, -1 );
  }else{
    toker_buf = "";
  }

  // If not a comment nor a text then it has to be a word
  toker_start_ii = toker_ii;
  toker_state = token_type_word;
  process_word_state();

} // process_base_state()


function process_comment_state(){

  toker_buf += toker_ch;

  // When inside the first comment at the very beginning of the file
  // Different programming language have different styles
  // Icon uses literate programming with code lines started using >
  // See https://en.wikipedia.org/wiki/Comment_(computer_programming)

  if( ! first_comment_seen && !toker_is_space ){

    // ToDo: skip #! shebang
    // see https://en.wikipedia.org/wiki/Shebang_(Unix)

    // Inox style of comments, ~~ and ~| xxx |~
    if( teq( toker_ch, "~" ) ){
      set_style( "inox" );

    // sh shell type of comments, #
    }else if( teq( toker_ch, "#" ) ){
      set_style( "sh" );

    // C style of comments, either // or /* xxx */
    }else if( teq( toker_ch, "/" ) ){
      set_style( "c" );

    // Forth style, either \ or ( xxx )
    }else if( teq( toker_ch, "(" ) ){
      set_style( "forth" );

    // Lisp style, ;
    }else if( teq( toker_ch, ";" ) ){
      set_style( "lisp" );

    // Prolog style, %
    }else if( teq( toker_ch, "%" ) ){
      set_style( "prolog" );
    }
  }

  // If this is a monoline comment ending, emit it
  if( toker_is_eol || toker_is_eof ){
    // ~~ style of comments
    if( tneq( comment_monoline, "" )
      && ( teq(
        tcut( toker_buf, tlen( comment_monoline ) ),
        comment_monoline
      ) )
    ){
      // Emit token, without start of comment sequence and without lf
      token_type = token_type_comment;
      toker_buf = tmid( toker_buf, tlen( comment_monoline ), -1 );
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }
    // Literate style of comments
    if( is_literate ){
      // Emit token, whole line without lf
      token_type = token_type_comment;
      toker_buf = tcut( toker_buf, - 1 );
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }
  }

  // If this terminates the multiline comment, emit the comment
  if( teq( toker_ch, comment_multine_last_ch )
  && teq( tcut( toker_buf, tlen(  comment_multiline_begin ) ),
                            comment_multiline_begin )
  && teq( tbut( toker_buf, -tlen( comment_multiline_end ) ),
                            comment_multiline_end )
  ){
    // Emit token, without start & end of comment sequence
    token_type = token_comment_multiline;
    toker_buf = tmid( toker_buf,
      tlen(   comment_multiline_begin ),
      - tlen( comment_multiline_end )
    );
    token_text = toker_buf;
    token_is_ready = true;
    return;
  }

  // Premature end of file, something else was expected
  if( toker_is_eof ){
    token_type = first_comment_seen
    ? token_type_error
    : token_type_eof;
    toker_buf = first_comment_seen
    ? S() + "eof in token state " + N( toker_state )
      + " (" + token_type_to_text( toker_state ) + ")"
    : no_text;
    token_text = toker_buf;
    token_is_ready = true;
    return;
  }

} // process_comment_state()


function process_text_state(){

  // " marks the end of the text token
  if( teq( toker_ch, "\"" ) ){
    token_type  = token_type_text;
    token_text = toker_buf;
    token_is_ready = true;
  }

  // New lines are ok inside a "xxxx" text token
  if( teq( toker_ch, "\n" ) ){
    toker_line_no++;
    toker_column_no = 0;
  }

  // ToDo: handle escape sequences
  toker_buf += toker_ch;

} // process_text_state()


function process_word_state(){

  // ToDo: this assert fails, why? de&&mand( buf.length > 0 );

  // If a xxx: naming prefix was there, it will come next
  if( toker_post_literal_name != "" ){
    back_token_type  = token_type_word;
    back_token_text = toker_post_literal_name;
    // ToDo: position, line_no, column_no of back token
    toker_post_literal_name = "";
  }

  // space is always a word delimiter
  if( toker_is_space ){

    // Eager mode is blind to alias, space only matters
    if( toker_eager_mode ){
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }

    // ToDo: this fails, why? de&&mand( buf.length > 0 );

    // ToDo: refactor
    if( is_literate ){
      toker_buf = handle_literate_style( toker_buf );
    }
    if( token_type == token_type_comment ){
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }

    let auto_aliased = alias( toker_buf );

    // If simple word substitution with an alias
    if( tlen( auto_aliased ) > 0 ){
      if( tidx( auto_aliased, " " ) == -1 ){
        toker_buf = auto_aliased;
        token_text = toker_buf;
        token_is_ready = true;
      }else{
        token_de&&bug( S()+ "alias for " + toker_buf + " is " + auto_aliased );
        // When this happens, restart as if from new source, base state.
        // Change source code to insert the extra stuff and scan again
        // ToDo: this breaks the index/line/column scheme
        // ToDo: this is very inefficient
        // ToDo: this code is duplicated somewhere below
        toker_text = auto_aliased + tbut( toker_text, toker_ii );
        toker_text_length  = tlen( toker_text );
        toker_alias_cursor = tlen( auto_aliased );
        toker_ii = 0;
        toker_buf = "";
        toker_state = token_base;
      }
      return;
    // Unless no alias or alias expands into more than a simple word
    }else if( tlen( auto_aliased ) == 0 ){
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }

    // Forth uses only spaces as delimiters
    if( style_is_forth ){
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }
  }

  de&&mand( !toker_is_space );

  // Comma is ignored, it is there for readability only, unless Forth
  if( teq( toker_ch, "," )
  &&  !style_is_forth
  &&  !toker_eager_mode
  ){
    return;
  }

  // If eager mode then only space is a terminator
  if( style_is_forth
  ||  toker_eager_mode
  ){
    toker_buf += toker_ch;
    return;
  }

  // ToDo: what comes next needs some serious refactoring

  // Get some next characters, some lookahead helps sometimes
  refill_next_ch( toker_ii );

  // Handle line continuation when \ is last character on line, unless Forth
  // ToDo: should be defined by style
  if( teq( toker_ch, "\\" )
  && ch_is_eol( tcut( next_ch, 1 ) )
  ){
    toker_ii++;
    // Handle crlf
    if( teq( tcut( toker_ch, 1 ), "\r" )
    &&  teq( tmid( next_ch, 1, 1 ), "\n" ) ){
      toker_ii++;
    }
    return;
  }

  // . is a token if alone
  if( teq( toker_ch, end_define ) ){
    toker_is_limit
    = tlen( toker_buf ) != 0
    || ch_is_space( tcut( next_ch, 1 ) );

  // ; is a token
  }else if( teq( toker_ch, terminator_sign ) ){
    toker_is_limit = true;

  // Some other special characters are a limit too
  }else{
    toker_is_limit = ch_is_limit( toker_ch, tcut( next_ch, 1 ) );
  }

  // If no limit is reached, keep going
  if( !toker_is_limit ){
    toker_buf += toker_ch;
    return;
  }

  // If there was nothing before the limit, emit a single char token
  if( tlen( toker_buf ) == 0 && ! toker_is_space ){
    if( teq( toker_ch, "/" ) ){
      toker_buf = "/";
      return;
    }else{
      toker_start_ii = toker_ii - 1;
      toker_buf = toker_ch;
      token_text = toker_buf;
      token_is_ready = true;
    }

  // If there was something before the limit, deal with that
  }else if( tlen( toker_buf ) >= 0 ){

    // xx(, xx[ and xx{ are words of a special type.
    // so is xxx: when before a space or /xxx/yyy which is /xxx
    if( teq( toker_ch, "(" )
    ||  teq( toker_ch, '[' )
    ||  teq( toker_ch, '{' )
    ||  ( teq( toker_ch, ':' ) && teq( tcut( next_ch, 1 ), " " ) )
    || teq( toker_ch, '/' ) && tneq( tcut( toker_buf, 1 ), "/" )
    ){
      toker_buf = toker_buf + toker_ch;
      toker_ii++;

    // ) and } are also words of a special type
    } else if(
      ( teq( toker_ch, ")" ) || teq( toker_ch, "}" ) )
    && ch_is_limit( tcut( next_ch, 1 ), "" )
    ){
      toker_buf = toker_buf + toker_ch;
      toker_ii++;

    // xxx:", xxx:123, xxx:-123, to name literals
    } else if( teq( toker_ch, ":" ) ){

      // End of word if : is before a literal or another delimiter
      // ToDo: enable :: in words?
      if( teq( tcut( next_ch, 1 ), "\"" )
      ||  teq( tcut( next_ch, 1 ), "-" )
      ||  ch_is_digit( tcut( next_ch, 1 ) )
      ||  ch_is_limit( tcut( next_ch, 1 ), "" )
      ){
        // ToDo: get rid of post_literal_name
        toker_post_literal_name = ":" + toker_buf;
        back_token_type = token_type_word;
        back_token_text = toker_post_literal_name;
        // ToDo: handle position, line_no, column_no of back token
        toker_post_literal_name = "";
        toker_buf = "";
      }else{
        toker_buf += ":";
      }
      return;
    }

    // A well separated word was collected, before or with the limit
    toker_ii--;

    // Change word if some alias was defined for it
    if( is_literate ){
      toker_buf = handle_literate_style( toker_buf );
    }

    let auto_word_alias = alias( toker_buf );

    // In Inox style the aliases can expand into multiple words
    if( tlen( auto_word_alias ) > 0  && teq( the_style, "inox" ) ){
      // Complex case, potentially expand into multiple tokens
      let index_space = tidx( auto_word_alias, " " );
      if( index_space != -1 ){
        token_de&&bug( S()+
          "alias for " + toker_buf + " is " + auto_word_alias
        );
        // When this happens, restart as if from new source, base state.
        // Change source code to insert the extra stuff and scan again
        // ToDo: this breaks the index/line/column scheme
        // ToDo: this is very inefficient
        toker_text = auto_word_alias + tbut( toker_text, toker_ii );
        toker_text_length  = tlen( toker_text );
        toker_alias_cursor = tlen( auto_word_alias );
        toker_ii = 0;
        toker_buf = "";
        toker_state = token_base;
        return;
      }
    }

    if( tlen( auto_word_alias ) > 0 ){
      toker_buf = auto_word_alias;
    }
    token_text = toker_buf;
    token_is_ready = true;

  }
} // process_word_state()


function detect_infinite_loop(){
  if( !de )return;
  if( toker_ii == toker_previous_ii && toker_state == toker_previous_state ){
    bug( "Infinite loop detected in next_token" );
    debugger;
    // Skip to end of file
    toker_ii = toker_text_length;
  }
  toker_previous_ii    = toker_ii;
  toker_previous_state = toker_state;
}


function next_token(){
// Split source code into syntax tokens

  // ToDo: horn clauses, prolog syle
  // See http://tau-prolog.org/files/doc/grammar-specification.pdf

  // ToDo: lisp like nil and lists
  // See https://www.cs.cmu.edu/Groups/AI/html/cltl/clm/node9.html

  // ToDo: study Scheme implementations
  // See https://legacy.cs.indiana.edu/~dyb/pubs/3imp.pdf

  // If there is some token already, simply delivers it
  if( back_token_type ){
    token_type = back_token_type;
    back_token_type = 0;
    token_text = back_token_text;
    back_token_text = "";
    return;
  }

  // Get to where things were before
  toker_ii = toker_text_cursor;

  // Where the new token starts
  toker_start_ii = toker_ii;

  // Current token, defaults to a token_word type of token
  token_type      = token_type_word;
  token_text      = "";
  token_position  = toker_start_ii;
  token_line_no   = toker_line_no;
  token_column_no = toker_column_no;

  toker_state = first_comment_seen ? token_base : token_type_comment;

  // Buffer to collect token text
  toker_buf = "";

  // One character at a time
  toker_ch       = "";
  toker_is_space = false;
  toker_is_eol   = false;
  toker_is_eof   = false;

  // Space is the normal deliminator between words, there are special cases
  toker_is_limit = false;

  toker_front_spaces = 0;

  toker_previous_ii    = -1;
  toker_previous_state = token_type_error;

  style_is_forth = teq( the_style, "forth" );

  token_is_ready = false;

  while( !token_is_ready ){
    detect_infinite_loop();
    process_whitespaces();
    if( token_is_ready )break;
    // State machine:
    // base -> word    -> base
    // base -> text    -> base
    // base -> comment -> base
    switch( toker_state ){
      case token_base         : process_base_state();    break;
      case token_type_comment : process_comment_state(); break;
      case token_type_text    : process_text_state();    break;
      case token_type_word    : process_word_state();    break;
    default:
      token_type  = token_type_error;
      token_text = "error, bad state in next_token()";
      token_is_ready = true;
    }
  }

  // Automatically get back to /base state when a token is ready
  de&&mand( token_is_ready );
  // de&&mand( buf == token_value );
  toker_state = token_base;

  // If a xxx: naming prefix was there, it comes next
  if( toker_post_literal_name != "" ){
    back_token_type = token_type_word;
    back_token_text = toker_post_literal_name;
    // ToDo: handle position, line_no, column_no of back token
    toker_post_literal_name = "";
  }

  // Save state for next call to next_token()
  toker_text_cursor = toker_ii;

  if( token_de ){
    bug( S()+ "\n"
      + "Token. next is "
      + token_type_to_text( token_type ) + " " + token_text + ", "
      + "line " + N( toker_line_no )
      + " \"" + extract_line( toker_text, toker_start_ii ) + "\""
    );
  }

} // next_token()


// Some basic tests of the tokenizer

function test_token( typ : Index, val : TxtC ){

  // Save tokenizer context
  const save_cursor  = toker_text_cursor;
  const save_seen    = first_comment_seen;
  const save_reached = toker_indentation_reached;

  next_token();

  // Skip indentation related tokens
  if( token_type == token_type_indent ){ next_token(); }

  let error = false;
  if( token_type != typ ){
    bug( S()
      + "Bad type from next_token(), "
      + token_type_to_text( token_type )
      + " vs expected " + token_type_to_text( typ ) + "."
    );
    error = true;
  }
  if( tlen( val ) > 0 && tneq( token_text, val ) ){
    bug( S()
      + "Bad value from next_token(), " + token_text
      + " vs expected " + val + "."
    );
    error = true;
  }

  if( error ){
    // Restore tokenizer context to retry under debugger
    toker_text_cursor         = save_cursor;
    first_comment_seen        = save_seen;
    toker_indentation_reached = save_reached;
    debugger;
    // This is convenient for interactive debugging
    test_token( typ, val );
  }

} // test_token()


function test_tokenizer() : Index {

  tokenizer_restart( "" );
  test_token( token_type_eof, "" );

  tokenizer_restart( "#!/bin/inox\n#ok" );
  test_token( token_type_comment, "!/bin/inox" );
  test_token( token_type_comment, "ok" );
  test_token( token_type_eof, "" );

  tokenizer_restart(  "/**/" );
  test_token( token_comment_multiline, "" );
  test_token( token_type_eof, "" );

  tokenizer_restart(  "~| test |~~~ test" );
  test_token( token_comment_multiline, " test " );
  test_token( token_type_comment, " test" );
  test_token( token_type_eof, "" );

  tokenizer_restart( "~~ test\n~| test |~" );
  test_token( token_type_comment, " test" );
  test_token( token_comment_multiline, " test " );
  test_token( token_type_eof, "" );

  tokenizer_restart( "( test1 )\\\n\\test2" );
  test_token( token_comment_multiline, " test1 " );
  test_token( token_type_comment, "" );
  test_token( token_type_comment, "test2" );
  test_token( token_type_eof, "" );

  tokenizer_restart( "() 0 1234 \",\" + : abc, ; , ." );
  test_token( token_comment_multiline, "" );
  test_token( token_type_word, "0"     );
  test_token( token_type_word, "1234"  );
  test_token( token_type_word, "\",\"" );
  test_token( token_type_word, "+"     );
  test_token( token_type_word, ":"     );
  test_token( token_type_word, "abc,"  );
  test_token( token_type_word, ";"     );
  test_token( token_type_word, ","     );
  test_token( token_type_word, "."     );
  test_token( token_type_eof, ""       );

  tokenizer_restart( "~~\n \",\" + : -: ( ) () o( o() (| |) (- -) (( )) [ ] " );
  test_token( token_type_comment, "" );
  test_token( token_type_text, ","  );
  test_token( token_type_word, "+"  );
  test_token( token_type_word, ":"  );
  test_token( token_type_word, "-:" );
  test_token( token_type_word, "("  );
  test_token( token_type_word, ")"  );
  test_token( token_type_word, "("  );
  test_token( token_type_word, ")"  );
  test_token( token_type_word, "o(" );
  test_token( token_type_word, "o(" );
  test_token( token_type_word, ")"  );
  test_token( token_type_word, "(|" );
  test_token( token_type_word, "|)" );
  test_token( token_type_word, "(-" );
  test_token( token_type_word, "-)" );
  test_token( token_type_word, "((" );
  test_token( token_type_word, "))" );
  test_token( token_type_word, "["  );
  test_token( token_type_word, "]"  );
  test_token( token_type_eof, ""    );

  tokenizer_restart( "~~\n a, abc;,. [[ ]] #[ ]# xxx.[ ] " );
  test_token( token_type_comment, "" );
  test_token( token_type_word, "a"   );
  test_token( token_type_word, "abc" );
  test_token( token_type_word, ";"   );
  test_token( token_type_word, "."   );
  test_token( token_type_word, "[["  );
  test_token( token_type_word, "]]"  );
  test_token( token_type_word, "#["  );
  test_token( token_type_word, "]#"  );
  test_token( token_type_word, "xxx" );
  test_token( token_type_word, ".["  );
  test_token( token_type_word, "]"   );
  test_token( token_type_eof, ""     );

  tokenizer_restart( "( forth )\n : .\" out abc ; a!" );
  test_token( token_comment_multiline, " forth " );
  test_token( token_type_word, ":"   );
  test_token( token_type_word, ".\"" );
  test_token( token_type_word, "out" );
  test_token( token_type_word, "abc" );
  test_token( token_type_word, ";"   );
  test_token( token_type_word, "a!"  );
  test_token( token_type_eof, ""     );

  tokenizer_restart( "/**/ to debugger debugger." );
  test_token( token_comment_multiline, "" );
  test_token( token_type_word, "to" );
  test_token( token_type_word, "debugger"     );
  test_token( token_type_word, "debugger" );
  test_token( token_type_word, "."  );
  test_token( token_type_eof,  ""   );

  tokenizer_restart(
    "~~\n to aa ct: void is: as_v( void:0 );bb. .)."
  );
  test_token( token_type_comment, "" );
  test_token( token_type_word, "to"    );
  test_token( token_type_word, "aa"    );
  test_token( token_type_word, "ct:"   );
  test_token( token_type_word, "void"  );
  test_token( token_type_word, "is:"   );
  test_token( token_type_word, "as_v(" );
  test_token( token_type_word, "0"     );
  test_token( token_type_word, ":void" );
  test_token( token_type_word, ")"     );
  test_token( token_type_word, ";"     );
  test_token( token_type_word, "bb"    );
  test_token( token_type_word, "."     );
  test_token( token_type_word, ".)"    );
  test_token( token_type_word, "."     );
  test_token( token_type_eof, ""       );

  tokenizer_restart(
    "~||~ to ct:is: aa:bb void:0 .x! x| |x |x!"
  );
  test_token( token_comment_multiline, "" );
  test_token( token_type_word, "to"     );
  test_token( token_type_word, "ct:is:" );
  test_token( token_type_word, "aa:bb"  );
  test_token( token_type_word, "0"      );
  test_token( token_type_word, ":void"  );
  test_token( token_type_word, ".x!"    );
  test_token( token_type_word, "x|"     );
  test_token( token_type_word, "|x"     );
  test_token( token_type_word, "|x!"    );
  test_token( token_type_eof, ""        );

  tokenizer_restart(
    "~||~ it.x dup.:m d.m: m() dup.m() a:,b:"
  );
  test_token( token_comment_multiline, "" );
  test_token( token_type_word, "it"   );
  test_token( token_type_word, ".x"   );
  test_token( token_type_word, "dup"  );
  test_token( token_type_word, ".:m"  );
  test_token( token_type_word, "d"    );
  test_token( token_type_word, ".m:"  );
  test_token( token_type_word, "m("   );
  test_token( token_type_word, ")"    );
  test_token( token_type_word, "dup"  );
  test_token( token_type_word, ".m("  );
  test_token( token_type_word, ")"    );
  test_token( token_type_word, "a:b:" );
  test_token( token_type_eof,  ""     );

  tokenizer_restart(
    "~||~ a/ /a /a/b/c a/b/c a:."
  );
  test_token( token_comment_multiline, "" );
  test_token( token_type_word, "a/" );
  test_token( token_type_word, "/a" );
  test_token( token_type_word, "/a" );
  test_token( token_type_word, "/b" );
  test_token( token_type_word, "/c" );
  test_token( token_type_word, "a/" );
  test_token( token_type_word, "b/" );
  test_token( token_type_word, "c"  );
  test_token( token_type_word, "a:" );
  test_token( token_type_word, "."  );
  test_token( token_type_eof,  ""   );

  return 1;
}

// C++ needs a variable to initialize in order for test_tokenizer() to be called
let dummy_test_tokenizer = test_tokenizer();


/*
 *  set-literate primitive - set the tokenizer to literate style
 */

function primitive_set_literate(){
  const val = pop_boolean();
  tokenizer_set_literate_style( val ? true : false );
}
primitive( "set-literate", primitive_set_literate );


/* ----------------------------------------------------------------------------
 *  eval
 *  This is the source code interpretor. It reads a text made of verbs and
 *  executes it.
 *  It detects a special verb that starts the definition of a new verb.
 *  That definition is made of next verbs that are either added to the
 *  new verb or sometime executed immediatly instead because they help to
 *  build the new verb.
 *  Once a new verb is defined, it can be executed by the machine code
 *  interpretor that can be found in the RUN() function.
 */

//const tag_block             = tag( "block"               );
const tag_run_method_by_name  = tag( "run-method-by-name" );
const tag_run_method_by_tag   = tag( "run-method-by-tag"  );
const tag_local               = tag( "local"             );
const tag_set_local           = tag( "set-local"         );
const tag_data                = tag( "data"                );
const tag_set_data            = tag( "set-data"            );
const tag_object_get          = tag( "object-get"          );
const tag_object_set          = tag( "object-set"          );


/*
 *  integer-text? primitive
 */

const tag_is_integer_text = tag( "integer-text?" );

function is_integer( buf : Text ) : boolean {
  /**/ return ! isNaN( parseInt( buf ) );
  /*c{
    // ToDo: bugs when too big
    TxtC str = buf.c_str();
    for( unsigned int ii = 0 ; ii < buf.length() ; ii++ ){
      if( ! isdigit( str[ ii ] ) ){
        return false;
      }
    }
    return true;
  /*c*/
}


function primitive_is_integer_text(){
  de&&mand_cell_type( TOS, tag_text );
  const auto_buf = cell_to_text( TOS );
  clear( TOS );
  push_boolean( is_integer( auto_buf ) );
  set_tos_name( tag_is_integer_text );
}
primitive( "integer-text?", primitive_is_integer_text );


/*
 *  parse-integer primitive
 */

const tag_parse_integer = tag( "parse-integer" );
const tag_NaN = tag( "NaN" );


function text_to_integer( buf : Text ) : Value {
  // This function is called after is_integer() has returned true
  /**/ const parsed = parseInt( buf );
  /**/ de&&mand( ! isNaN( parsed ) );
  /**/ return parsed |0;
  /*c{
    // ToDo: handle overflow
    TxtC str = buf.c_str();
    int num = 0;
    for( int ii = 0 ; str[ ii ] != '\0' ; ii++ ){
        num = num * 10 + ( str[ ii ] - 48 );
    }
    return num;
  }*/
}


function primitive_parse_integer(){
  de&&mand_cell_type( TOS, tag_text );
  const auto_buf = cell_to_text( TOS );
  clear( TOS );
  /*!c{*/
  const parsed = parseInt( auto_buf );
  if( isNaN( parsed ) ){
    push_tag( tag_NaN );
  } else {
    push_integer( parsed );
    set_tos_name( tag_parse_integer );
  }
  /*}{
    if( ! is_integer( auto_buf ) ){
      push_tag( tag_NaN );
    } else {
      push_integer( text_to_integer( auto_buf ) );
      set_tos_name( tag_parse_integer );
    }
  /*c*/
}
primitive( "parse-integer", primitive_parse_integer );


/*
 *  eval primitive
 */

const tag_make_local = tag( "make-local" );
const tag_make_data  = tag( "make-data"  );


function mand_tos_is_in_bounds() : boolean {
  de&&mand( TOS <  ACTOR_data_stack_limit );
  de&&mand( TOS >= ACTOR_data_stack       );
  return true;
}


function mand_csp_is_in_bounds() : boolean {
  de&&mand( CSP <  ACTOR_control_stack_limit );
  de&&mand( CSP >= ACTOR_control_stack       );
  return true;
}


/* -----------------------------------------------------------------------------
 *  eval primitive
 *
 *  This is both the "outer" interpreter and the compiler, much like in Forth.
 *  It interprets a text input. That's not like the fast inner interpreter
 *  that runs a compiled binary representation made of compiled codes.
 *  However, using the define verb, which is "to" usualy but ":" in the Forth
 *  dialect, the outer interter is able to start the definition of a new verb
 *  or a redefinition, ie it compiles the following text until the end of the
 *  verb definition is reached. That end condition is either a dot or a line
 *  whose indentation level is less than the indentation level of the opening
 *  "to". Note that while going ahead in the input text, the outer interpreter
 *  may encounter special verbs that are immediately executed instead of beeing
 *  added to the verb being defined. Such verbs, nammed immediate verbs, may
 *  help to redefine the syntax of the language. I don't use that feature
 *  much but Forth people use it a lot because the Forth compiler does more
 *  work than I do here, like computing relative jumps for if/then control
 *  structures for example whereas I use { } enclosed blocks instead.
 *  See also https://www.reddit.com/r/Forth/comments/55b8ta/what_makes_immediate_mode_the_key_to_everything/
 *
 *  ToDo: use indendation in other usefull situations, not just the ending of a
 *  verb definition.
 *  ToDo: simplify the compiler using more immediate verbs.
 *  ToDo: rewrite that complex function in Inox so that the language can
 *  bootstrap itself.
 *  ToDo: a state less version.
 */


// A verb is made of cells. Let's name that Machine Codes
/**/ type MachineCode = Cell;
//c/ typedef Cell MachineCode;

// A block is an array of encoded verbs from {} delimited source code.
// The first cell is named block, it contains the number of cells
// in the block, including the first one and flags.
/**/ type InoxBlock = Cell;
//c/ typedef Cell InoxBlock;


/*
 *  Types of parse levels in the AST (Abstract Syntax Tree)
 *  It is actually a stack, not a tree.
 */

/**/ const parse_top_level     = 1;
//c/ #define parse_top_level     1
/**/ const parse_definition    = 2;
//c/ #define parse_definition    2
/**/ const parse_call          = 3;
//c/ #define parse_call          3
/**/ const parse_subexpr       = 4;
//c/ #define parse_subexpr       4
/**/ const parse_keyword       = 5;
//c/ #define parse_keyword       5
/**/ const parse_call_block    = 6;
//c/ #define parse_call_block    6
/**/ const parse_infix         = 7;
//c/ #define parse_infix         7
/**/ const parse_block         = 8;
//c/ #define parse_block         8



function parse_type_to_text( type : Index ) : Text {
  switch( type ){
    case parse_top_level   : return "top-level";
    case parse_definition  : return "definition";
    case parse_call        : return "call(";
    case parse_subexpr     : return "subexpr(";
    case parse_keyword     : return "keyword:";
    case parse_call_block  : return "call_block{";
    case parse_infix       : return "infix";
    case parse_block       : return "block{";
    default                : return "unknown";
  }
}


const tag_parse_top_level   = tag( "parse-top-level" );
const tag_parse_definition  = tag( "parse-definition" );
const tag_parse_call        = tag( "parse-call" );
const tag_parse_subexpr     = tag( "parse-subexpr" );
const tag_parse_keyword     = tag( "parse-keyword" );
const tag_parse_call_block  = tag( "parse-call-block" );
const tag_parse_infix       = tag( "parse-infix" );
const tag_parse_block       = tag( "parse-block" );
const tag_parse_unknown     = tag( "parse-unknown" );


function parse_type_to_tag( type : Index ) : Tag {
  switch( type ){
    case parse_top_level   : return tag_parse_top_level;
    case parse_definition  : return tag_parse_definition;
    case parse_call        : return tag_parse_call;
    case parse_subexpr     : return tag_parse_subexpr;
    case parse_keyword     : return tag_parse_keyword;
    case parse_call_block  : return tag_parse_call_block;
    case parse_infix       : return tag_parse_infix;
    case parse_block       : return tag_parse_block;
    default                : return tag_parse_unknown;
  }
}


function parse_tag_to_type( tag : Tag ) : Index {
  if( tag == tag_parse_top_level   ) return parse_top_level;
  if( tag == tag_parse_definition  ) return parse_definition;
  if( tag == tag_parse_call        ) return parse_call;
  if( tag == tag_parse_subexpr     ) return parse_subexpr;
  if( tag == tag_parse_keyword     ) return parse_keyword;
  if( tag == tag_parse_call_block  ) return parse_call_block;
  if( tag == tag_parse_infix       ) return parse_infix;
  if( tag == tag_parse_block       ) return parse_block;
  return 0;
}


// Some syntactic constructions can nest: calls, sub expressions, etc.

const tag_block_start = tag( "block-start" );
const tag_line_no     = tag( "line-no" );
const tag_column_no   = tag( "column-no" );

// This is a stack of parsing contexts, a simplified AST
let parse_stack = 0;

// Everything about the current parse context, they nest
let parse_depth       = 0;
let parse_type        = 0;
/**/ let  parse_name  = "";
//c/ static Text parse_name( "" );
let parse_verb        = 0;
let parse_block_start = 0;
let parse_line_no     = 0;
let parse_column_no   = 0;

// When a verb is defined, it's code is stored in a block
let eval_is_parsing_a_new_verb = false;

// Name of new verb being defined
/**/ let  parse_new_verb_name : Text;
//c/ static Text parse_new_verb_name( "" );

// Codes of new verb being defined, a stack
let parse_codes = 0;


/* ------------------------------------------------------------------------
 *  Parse nesting levels
 *  It is actualy a stack, not a tree. This would change if I were to
 *  implement operators precedence and associativity.
 *  See also https://en.wikipedia.org/wiki/Operator-precedence_parser
 *
 *  ToDo: I should use a stack of cells instead of a stack of native objects.
 *  With push() and pop() reading/writing a set of global variables. This
 *  would be another step towards a compiler that is written in Inox itself.
 */

function bug_parse_levels( title : TxtC ) : boolean {
  let auto_buf = S();
  auto_buf += "Parser. Levels. " + S() + title + " ";
  // Each level has type, name, verb, block_start, line_no, column_no
  // That's 6 cells per level
  auto_buf += stack_split_dump( parse_stack, 6 );
  trace( auto_buf );
  return true;
}


function push_parse_state(){
// Push the current parse context onto the parse stack
  // set( tmp, type_integer, tag_depth, parse_depth );
  // stack_push( parse_stack, tmp );
  set( the_tmp_cell, type_integer, tag_type, parse_type );
  stack_push( parse_stack, the_tmp_cell );
  set_text_cell( the_tmp_cell, parse_name );
  set_name( the_tmp_cell, tag_name );
  stack_push( parse_stack, the_tmp_cell );
  set( the_tmp_cell, type_integer, tag_verb, parse_verb );
  stack_push( parse_stack, the_tmp_cell );
  set( the_tmp_cell, type_integer, tag_block_start, parse_block_start );
  stack_push( parse_stack, the_tmp_cell );
  set( the_tmp_cell, type_integer, tag_line_no, token_line_no );
  stack_push( parse_stack, the_tmp_cell );
  set( the_tmp_cell, type_integer, tag_column_no, token_column_no );
  stack_push( parse_stack, the_tmp_cell );
}


function pop_parse_state(){
// Restore the current parse context using the parse stack
  let c;
  c = stack_pop( parse_stack );  // column_no
  parse_column_no = eat_integer( c );
  c = stack_pop( parse_stack );  // line_no
  parse_line_no = eat_integer( c );
  c = stack_pop( parse_stack );  // block_start
  parse_block_start = eat_integer( c );
  c = stack_pop( parse_stack );  // verb
  parse_verb = eat_integer( c );
  c = stack_pop( parse_stack );  // name
  parse_name = cell_to_text( c );
  clear( c );
  c = stack_pop( parse_stack );  // type
  parse_type = eat_integer( c );
  // c = stack_pop( parse_stack );  // depth
  // parse_depth = eat_integer( c );
}



/*
 *  compiler-enter primitive
 */

function parse_enter( type : Index, name : TxtC ){
// Entering a ( xx yy ), a f( xx yy ), a key: x word: y; or a {} block

  // Save the current parse context using the parse stack
  push_parse_state();

  // Update global parse variables for new context
  parse_depth       = stack_length( parse_stack ) / 6;
  parse_type        = type;
  // Level 1 is the top level, levels 2 are verb definitions
  de&&mand( parse_depth != 1 || parse_type == parse_top_level );
  de&&mand( parse_type != parse_definition || parse_depth == 2 );
  parse_name        = name;
  parse_verb        = 0;
  if( token_line_no ){
    parse_line_no   = token_line_no;
    parse_column_no = token_column_no;
  }

  parse_de&&bug_parse_levels( S()
    + "Entering " + parse_type_to_text( type )
    + ", depth is " + N( parse_depth )
    + ( tneq( name, no_text ) ? ( S()+ ", name is " + name ) : no_text )
  );
}


/*
 *  compiler-leave primitive
 */


function parse_leave(){

  parse_de&&bug_parse_levels( S()
    + "Leaving " + parse_type_to_text( parse_type )
    + ", depth is " + N( parse_depth )
  );

  let previous_level_type = parse_type;
  let previous_level_verb = parse_verb;

  // Restore previous parse context using the parse stack
  pop_parse_state();
  parse_depth = stack_length( parse_stack ) / 6;
  de&&mand( parse_depth != 1 || parse_type == parse_top_level );
  de&&mand( parse_type != parse_definition || parse_depth == 2 );

  // Close all infix operators at once
  if( previous_level_type == parse_infix ){
    eval_do_machine_code( previous_level_verb );
    if( parse_type == parse_infix ){
      // ToDo: avoid recursivity?
      parse_leave();
    }
  }

}


/*
 *  compile-definition-begin primitive
 */

function eval_definition_begin(){
// Called when entering a new verb definition, "to" if Inox dialect.

  // ToDo: should be an immediate primitive

  parse_enter( parse_definition, "" );
  eval_is_parsing_a_new_verb = true;
  if( parse_codes == 0 ){
    parse_codes = stack_preallocate( 100 );
  }
  de&&mand( stack_length( parse_codes ) == 0 );

  // Next token, the verb name, is special, it's anything until some space
  parse_new_verb_name = "";
  toker_eager_mode = true;
  de&&mand( eval_is_expecting_the_verb_name() );

}


function primitive_compile_definition_begin(){
  eval_definition_begin();
}
immediate_primitive( "compile-definition-begin", primitive_compile_definition_begin );

/*
 *  compile-definition-end primitive
 */

function eval_is_compiling() : boolean {
  if( eval_is_parsing_a_new_verb )return true;
  return false;
}


function eval_definition_end(){
// Called when terminating a new verb definition

  check_de&&mand( eval_is_compiling() );

  // About to store the definition in some never freed cells
  const verb_tag = tag( parse_new_verb_name );
  const len = stack_length( parse_codes );

  // Allocate cells, including space for length/flags header and return
  const header = allocate_cells( len + 2 );

  // Skip the header to get to the first code
  const def = header + 1 * ONE;

  // The header contains the number of codes, including the return
  set( header, type_integer, verb_tag, 0 );
  set_definition_length( def, len + 1 );

  // Copy new verb definition into newly allocated memory
  move_cells( stack_at( parse_codes, 0 ), def, len );

  // Add code to return from verb, aka "return" special code
  set_return_cell( def + len * ONE );

  // Add definition to the global symbol table
  register_method_definition( verb_tag, def );

  // Update the global variable that definition flag setters use
  // ToDo: do that as soon as name is kown?
  the_last_defined_verb = verb_tag;

  if( de ){
    const chk_def = definition_by_name( parse_new_verb_name );
    de&&mand_eq( chk_def, def );
    //  Check that there is a final return.
    de&&mand_eq( value( chk_def + len * ONE ), 0 );
  }

  stack_clear( parse_codes );

  // Close current parsing context, back to top level
  parse_leave();
  de&&mand( parsing( parse_top_level ) );

  // Change compilation state
  eval_is_parsing_a_new_verb = false;
  parse_new_verb_name = no_text;
  de&&mand( ! eval_is_compiling() );

  eval_de&&bug( S()+ "\n" + verb_to_text_definition( verb_tag ) );

} // eval_definition_end()


function primitive_compile_definition_end(){
  eval_definition_end();
}
immediate_primitive( "compile-definition-end", primitive_compile_definition_end );


/*
 *  compiling? primitive
 */

function primitive_is_compiling(){
  push_boolean( eval_is_compiling() );
}
primitive( "compiling?", primitive_is_compiling );


/*
 *  compiler-expecting? primitive
 */


function eval_is_expecting_the_verb_name() : boolean {

  // Should be called in compile mode only
  de&&mand( eval_is_compiling() );
  if( parse_type != parse_definition )return false;

  // Initialy the name of the verb is unknown, it follows "to"
  let it_is = teq( parse_new_verb_name, no_text );

  // When expecting the name, eager mode must be on
  de&&mand( !it_is || toker_eager_mode );

  return it_is;
}


function primitive_state_is_expecting(){
  push_boolean( eval_is_expecting_the_verb_name() );
}
primitive( "compiler-expecting?", primitive_state_is_expecting );


/*
 *  compile-literal primitive
 */

function eval_do_literal(){
  eval_de&&bug( S()+ "Eval. push literal " + dump( TOS ) );
  if( eval_is_compiling() && immediate_mode_level == 0 ){
    eval_de&&bug( S()+ "Eval. Compile literal " + dump( TOS ) );
    // ToDo: should push TOS into some extensible stack object
    // instead of allocating cells one at the time.
    // This would also help with definitions of dynamic verbs
    // that would be some kind of "lambda" verbs. This is needed
    // for higher order functions. The dynamic definition could
    // also embed a capture of the current data stack in order
    // to implement closures. This would also enable the currying
    // of verbs.
    stack_push( parse_codes, POP() );
    parse_de&&bug( S()
      + "Parse. Parse level "
      + parse_type_to_text( parse_type )
      + ", with literal " + dump( stack_peek( parse_codes ) )
      + ", now has " + N( stack_length( parse_codes ) ) + " codes"
    );
  }else{
    stack_de&&bug( S()+ "PUSH LITERAL\n" + stacks_dump() );
  }
};


function eval_do_text_literal( t : TxtC ){
  eval_de&&bug( S()+ "Eval. Do text literal " + t );
  // if( teq( t, ".\"" ) )debugger;
  push_text( t );
  eval_do_literal();
}


function eval_do_tag_literal( t : TxtC ){
  eval_de&&bug( S()+ "Eval. Do tag literal " + t );
  push_tag( tag( t ) );
  eval_do_literal();
}


function eval_do_verb_literal( t : TxtC ){
  eval_de&&bug( S()+ "Eval. Do verb literal " + t );
  push_verb( tag( t ) );
  eval_do_literal();
}


function eval_do_integer_literal( i : Value ){
  eval_de&&bug( S()+ "Eval. Do integer literal " + N( i ) );
  push_integer( i );
  eval_do_literal();
}


function primitive_compile_literal(){
  eval_do_literal();
}
primitive( "compile-literal", primitive_compile_literal );


/*
 *  compile-verb primitive
 */

function add_machine_code( code : Tag ){
// Add a verb to the beeing built block or new verb

  de&&mand( eval_is_compiling() );

  // Inline code definition if it is very short or if verb requires it
  const def = definition( code );

  // The last code is always a return, hence the - 1
  const def_len = definition_length( def ) - 1;

  // ToDo: don't inline the definition of "future" verbs, ie forward declared

  // Either inline the associated definition or add a code to reference it
  if( def_len <= 1 || is_inline_verb( code ) ){

    // ToDo: inlining a constant is not a good idea when it is actually
    // a global variable..., see the hack avoiding this in primitive_constant()
    stack_push_copies( parse_codes, def, def_len );

  }else{

    // ToDo: I should use the value to store the definition address.
    // But then what happens when the definition is changed?
    // Should the old or new definition be used?
    // If the old definition is used, it may optionaly jump to the new one.
    // So that it is possible to redefine a verb without breaking existing
    // code that uses it. However, this means that there is now an overhead
    // for all the old definitions. But is it worse than the overhead of
    // looking up the definition address each time the verb is used?
    // There could also be a "final" flag that would tell the compiler
    // that the definition of the verb will not change anymore. In that
    // case, the compiler can use the value to store the definition address.
    // One may still redefine the verb, ignoring the final flag, but then
    // the new definition will be for new verbs only, it would not affect
    // existing code that would still use the old definition, at full speed.
    // I will study this later, avoiding premature optimization.
    // The opposite of "final" would be "volatile", meaning that the
    // definition may change at any time, so the value must be used
    // to look up the definition address each time the verb is used.
    // Only the name matters, for now, so 0 is ok
    set( the_tmp_cell, type_verb, code, 0 );
    stack_push( parse_codes, the_tmp_cell );
  }

  const block_len = stack_length( parse_codes );
  de&&mand( block_len > 0 );

  // Remember last added code, see last-token. ToDo: -last-verb?
  set_value( the_last_token_cell, code );

  parse_de&&bug( S()
    + "Parse. Parse level "
    + parse_type_to_text( parse_type )
    + ", with code for " + N( code ) + " " + tag_to_text( code )
    + ", now has " + N( stack_length( parse_codes ) ) + " codes"
  );

}


function eval_do_machine_code( tag : Name ){

  // Run now or add to definition of a new verb?
  if( ! eval_is_compiling()
  || is_immediate_verb( tag )
  || immediate_mode_level != 0
  ){

    // Run now case
    eval_de&&bug( S()
      + "Eval. do_machine_code, RUN "
      + C( tag ) + " " + tag_to_text( tag )
    );

    // Remember in control stack what verb is beeing entered
    // ToDo: should use type_word?
    // ToDo: optimize by returning to some "back-to-outer-interpreter"
    // This primitive would exit the inner interpreter and return to the
    // outer interpreter, which would then continue to execute the
    // next instruction. This would avoid the overhead of checking
    // against 0 whenever a "return" is executed. This optimization
    // requires using an exception to exit the inner interpreter.
    CSP += ONE;
    set( CSP, type_integer, tag, 0 );
    IP = definition( tag );
    de&&mand_neq( IP, 0 );

    // Check stacks
    // ToDo: grow them when needed?
    de&&mand( TOS < ACTOR_data_stack_limit );
    de&&mand( TOS >= ACTOR_data_stack );

    stack_de&&bug( S()
      + "Eval. Before immediate RUN of " + tag_to_text( tag )
      + " at IP " + C( IP )
      + "\n" + stacks_dump()
    );

    // ToDo: try{ ... } and "back-to-outer-interpreter" primitive
    RUN();

    de&&mand( TOS < ACTOR_data_stack_limit );
    de&&mand( TOS >= ACTOR_data_stack );
    stack_de&&bug( S()
      + "\nEval. After immediate RUN of "
      + tag_to_text( tag )
      + "\n" + stacks_dump()
    );

  // When adding to the definition of a new verb or block
  }else{

    eval_de&&bug( S()
      + "Eval. do_machine_code, compile "
      + C( tag ) + " " + tag_to_text( tag )
      + " into definition of " + parse_new_verb_name
    );

    add_machine_code( tag );
  }

}


function primitive_compile_verb(){
  const tag = pop_tag();
  eval_do_machine_code( tag );
}
primitive( "compile-verb", primitive_compile_verb );


/*
 *  compile-quote primitive
 */

let eval_must_not_compile_next_token = false;

function eval_quote_next_token(){
  eval_must_not_compile_next_token = true;
};


function primitive_compile_quote(){
  eval_quote_next_token();
}
primitive( "compile-quote", primitive_compile_quote );


/*
 *  compile-block-begin primitive
 */

function eval_block_begin( verb : TxtC ){

  // ToDo: value could be a qualifier about the block.
  // For verbs, only the name is used, the value is ignored but
  // it could be used in multiple ways to store various informations
  // at the call place. For example, it could be used to store
  // the address of the definition of the word. This could speed
  // up the lookup of the definition, but it would also make it
  // impossible to redefine the word. So it would be a good idea
  // to have a "final" flag that would tell the compiler that
  // the definition of the word will not change anymore. In that
  // case, the compiler can use the value to store the definition address.
  // One may still redefine the word, ignoring the final flag, but then
  // the new definition will be for new words only, it would not affect
  // existing code that would still use the old definition, at full speed.

  if( tlen( verb ) == 0 ){
    parse_enter( parse_block, no_text );
  }else{
    parse_enter( parse_call_block, verb );
  }

  eval_do_machine_code( tag_block );

  // Reserve one verb for block's length, like for verb definitions
  parse_block_start = stack_length( parse_codes );
  set( the_tmp_cell, type_integer, tag_block_header, 0 );
  stack_push_copy( parse_codes, the_tmp_cell );

}


function primitive_compile_block_begin(){
  eval_block_begin( pop_as_text() );
}
primitive( "compile-block-begin", primitive_compile_block_begin );


/*
 *  compile-block-end primitive
 */

function eval_block_end(){

  // Add a "return" at the end of the block, a 0/0/0 actually
  clear( the_tmp_cell );
  stack_push_copy( parse_codes, the_tmp_cell );

  const block_length = stack_length( parse_codes ) - parse_block_start;
  de&&mand( block_length > 0 );

  // Set argument for block, make it look like a valid literal
  de&&mand_eq(
    name( stack_at( parse_codes, parse_block_start ) ),
    tag_block_header
  );
  set_value(
    stack_at( parse_codes, parse_block_start ),
    ( block_length - 1 )
  ); // -1 not to add the length verb

  eval_de&&bug(
    "End of block, start = " + N( parse_block_start )
    + ", at " + N( stack_at( parse_codes, parse_block_start ) )
    + ", length = " + N( block_length )
  );

  parse_leave();
}


function primitive_compile_block_end(){
  eval_block_end();
}
primitive( "compile-block-end", primitive_compile_block_end );


/*
 *  Helpers to strip prefix and suffix from a verb's name
 */

function operand_X( v : Text ) : Text {
// remove first character, ex .a becomes a
  return tbut( v, 1 );
}


function operand__X( v : Text ) : Text {
// remove firts two characters
  return tbut( v, 2 );
}


function operand_X_( v : Text ) : Text {
// remove first and last characters
  return tmid( v, 1, -1 );
}


function operandX_( v : Text ) : Text {
// remove last character
  return tcut( v, -1 );
}


/*
 *  Special verbs are verbs whose names are special.
 *  . ; ( ) { and } are special verbs.
 *  verbs starting with . / # > or _ are usually special.
 *  verbs ending with : / # > _ ( or { are usually special.
 *  There are exceptions. Single character verbs are usually not special.
 *  What is special about special verbs is that they special meanings
 *  understood by the compiler.
 *  Note: , is a very special character, it always behaves as a space.
 */

function is_special_verb( val : Text ) : boolean {

  // ToDo: parsing verbs should be immediate verb, not special tokens
  if( val == "." || val == ";" )return true;
  if( val == "(" || val == ")" )return true;
  if( val == "{" || val == "}" )return true;

  // Special verbs are at least 2 characters long
  if( tlen( val ) < 2 )return false;

  /**/ const first_ch = val[ 0 ];
  //c/ Text  first_ch( tcut( val, 1 ) );
  /**/ const last_ch  = val[ tlen( val ) - 1 ];
  //c/ Text  last_ch( tbut( val, -1 ) );

  // if( last_ch == "?" )return false;        // Predicates are not special
  // if( last_ch == first_ch )return false;   // xx and x...x is not special

  // .xxx is for member access
  if( first_ch == "." )return true;

  // :xxx is for naming
  if( first_ch == ":" )return true;

  // /xxx is for tags
  if( first_ch == "/" )return true;

  // #xxx is for tags too, also for #xxx# verb literals
  if( first_ch == "#" )return true;

  // >xxx is for local variables
  if( first_ch == ">" )return true;

  // _xxx is for data variables
  if( first_ch == "_" )return true;

  // xxx/ is for tags too
  if( last_ch  == "/" )return true;

  // xxx> is for local variables
  if( last_ch  == ">" )return true;

  // xxx: is for keywords
  if( last_ch  == ":" )return true;

  // xxx( is for calls
  if( last_ch  == "(" )return true;

  // xxx{ is for block calls
  if( last_ch  == "{" )return true;

  return false;

}


/*
 *  eval primitive
 */

function tok_match( t : Index, s : Text ) : boolean {
  if( token_type != t )return false;
  if( tneq( token_text, s ) )return false;
  return true;
}


function tok_word( s : Text ) : boolean {
  return tok_match( token_type_word, s );
}


function tok_type( t : Index ) : boolean {
  return token_type == t;
}


function tok( s : Text ) : boolean {
  return teq( token_text, s );
}


function parsing( node_type : Index ) : boolean {
  return parse_type == node_type;
}


function primitive_eval(){

  // The source code to evaluate is at the top of the stack, get it
  /**/ const source  = pop_as_text();
  //c/ Text  source  = pop_as_text();

  // Reinitialize the stream of tokens
  tokenizer_restart( source );
  eval_de&&bug( S()+ "eval " + tcut( source, 100 ) );

  // The top level is the initial state of the parser, depth 0
  de&&mand_eq( parse_stack, 0 );
  parse_stack = stack_preallocate( 100 );
  parse_enter( parse_top_level, "" );

  // Maybe an existing verb named like the token's text value
  let verb_id = 0;

  // Name of verb for xxx( ... ) and xxx{ ... } calls
  /**/ let call_verb_name  = "";
  //c/ static Text call_verb_name(   "" );

  let done            = false;
  let is_special_form = false;
  let is_int          = false;
  let is_operator     = false;
  let token_length    = 0;

  /* ---------------------------------------------------------------------------
   *  Eval loop, until error or eof
   */

  // ToDo: stackless eval loop
  while( true ){

    verb_id         = 0;
    done            = false;
    is_special_form = false;
    is_int          = false;
    is_operator     = false;

    stack_de&&mand_stacks_are_in_bounds();

    // This will update global variables token_type, token_text, etc
    next_token();

    if( de && token_text == "token-debugger" )debugger;

    // ~~ and ~~| ... |~~, skip these comments
    if( tok_type( token_type_comment )
    ||  tok_type( token_comment_multiline )
    ){
      // ToDo: verb for definitions should be normal verbs
     continue;
    }

    // ++ indent has no effect, for now
    if( tok_type( token_type_indent )
    &&  tok( "++" )
    ){
      continue;
    }

    // error ? exit loop on tokenizer error
    if( tok_type( token_type_error ) ){
      bug( S()
        + "Eval, tokenizer error " + token_text
        + " at line " + N( token_line_no )
        + ", column " + N( token_column_no )
      );
      break;
    }

    // eof ? exit loop at end of the input stream
    if( tok_type( token_type_eof ) ){
      // ToDo: signal premature end of file
      if( ! parsing( parse_top_level ) ){
        bug( S()+ "Eval, premature end of file" );
        debugger;
      }
      break;
    }

    // to, it starts an Inox verb definition
    // ToDo: handle this better, : and to could be verbs as in Forth
    // ToDo: should be outside the loop but can change inside...
    let is_forth = ( teq( the_style, "forth" ) );

    // "to" is detected almost only at the base level
    // ToDo: enable nested definitions?
    if( tok_word( begin_define ) ){
      // As a convenience it may terminate an unfinished previous definition
      if( parsing( parse_definition )
      &&  token_column_no == 0
      &&  stack_length( parse_codes ) > 0
      &&  !eval_is_expecting_the_verb_name()
      ){
        eval_definition_end();
      }
      if( parsing( parse_top_level ) ){
        eval_definition_begin();
        de&&mand( eval_is_expecting_the_verb_name() );
        continue;
      }
    }

    // eol, an absence of indentation may terminate a non empty definition
    if( tok_match( token_type_indent, "--" )
    &&  token_column_no    == 0
    &&  parsing( parse_definition )
    &&  stack_length( parse_codes ) > 0
    ){
      eval_definition_end();
      continue;
    }

    // to xxx, name for the new Inox verb
    if( tok_type( token_type_word )
    &&  eval_is_compiling()
    &&  eval_is_expecting_the_verb_name()
    ){
      // ToDo: make that a primitive
      parse_new_verb_name = token_text;
      de&&mand( !eval_is_expecting_the_verb_name() );
      de&&mand( toker_eager_mode );
      if( toker_eager_mode ){
        toker_eager_mode = false;
      }
      eval_de&&bug( S()
        + "Parser. New definition for verb " + token_text
      );
      // Update global variables for primitive_immediate & co
      set_name(  the_last_token_cell, tag( token_text ) );
      set_value( the_last_token_cell, tag( token_text ) );
      continue;
    } // name of new verb

    // lf, decreased Indentation to column 0 detect the end of a definition
    if( token_column_no == 0
    &&  tok_match( token_type_indent, "--" )
    ){
      if( eval_is_compiling()
      &&  ! parsing( parse_definition )
      ){
        token_type = token_type_word;
        token_text = end_define;
      }
    }

    // . or ; or ) or } terminator ? first close all postponed infix operators
    if( parsing( parse_infix )
    && ( tok_type( token_type_word )
      && ( ( tok( ";" ) && !is_forth )
        || tok( ")" )
        || tok( "}" )
        || tok( end_define ) // "."
      )
    ) ){
      parse_leave();
    }

    // to, again ? common error is to forget some ; ) or }
    if( eval_is_compiling()
    &&  tok_word( begin_define )
    ){
      bug( S()
        + "Parser. Nesting error, unexpected " + token_text
        + " at line " + N( token_line_no )
        + " while expecting the end of "
        + parse_type_to_text( parse_type )
        + " in definition of " + parse_new_verb_name
        + " at line " + N( parse_line_no )
        + ", column " + N( parse_column_no )
      );
      debugger;
      break;
    }

    // From now it is most often either a literal or a verb.
    // If compiling a verb, that literal or verb is added to the current verb.

    // "..." ? if text literal
    if( tok_type( token_type_text ) ){
      eval_do_text_literal( token_text );
      continue;
    }

    // If not word token nor indentation then it is an internal error
    if( ! tok_type( token_type_word )
    &&  ! tok_type( token_type_indent )
    ){
      bug( S()
        + "Eval. Internal error. Invalid token "
        + token_type_to_text( token_type )
        + ", value "  + token_text
        + ", line "   + N( token_line_no )
        + ", column " + N( token_column_no )
      );
      debugger;
      break;
    }

    // If some form of quotation is involved, process as a tag to push now
    if( eval_must_not_compile_next_token ){
      de&&bug( S()+ "Eval. Must not compile, " + token_text );
      eval_must_not_compile_next_token = false;
      // ToDo: should store text?
      copy_cell( tag( token_text ), PUSH() );
      continue;
    }

    if( ! tok_type( token_type_word ) )continue;
    // ToDo: this assert fails, why? de&&mand( val != "" );
    if( tok( no_text ) )continue;

    // OK. It's a word token

    if( verb_exists( token_text ) ){
      // Existing verbs take precedence in all cases
      verb_id = tag( token_text );
      done = true;
    }else{
      // If not a verb, it may be a special form, a literal, etc
      // ToDo: handle integer and float literals here
      is_int = is_integer( token_text );
    }

    // Sometimes it is the last character that help understand
    /**/ let  first_ch = token_text[ 0 ];
    //c/ char first_ch = token_text.at( 0 );

    token_length = tlen( token_text );

    /**/ let last_ch
    /**/ = token_length > 1 ? token_text[ token_length - 1 ] : first_ch;
    //c/ char last_ch
    //c/ = token_length > 1 ? token_text.at( token_length - 1 ) : first_ch;

    // What happens next with the new token depends on multiple factors:
    // a) The type of nested structure we're currently in:
    //   "call("     - after some xxx( and until the closing ).
    //   "call{"     - after some xxx{ and until the closing }.
    //   "subexpr (" - after ( and until the closing ).
    //   "infix"     - after an operator and until another one
    //                 or the end of the enclosing structure.
    //   "keyword"   - after xxxx: and until ; or the end of the
    //                 enclosure structure.
    //   "top-level" - the top level structure.
    // b) Is the verb defined?
    //

    // In Forth no verb is special
    // ToDo: ; { and } are still special, they should be verbs too
    if( !done && is_forth
    &&  ! tok( ";" )
    &&  ! tok( "{" )
    &&  ! tok( "}" )
    &&  !is_int
    ){
      if( !verb_exists( token_text ) ){
        parse_de&&bug( S()+ "Parser. Forth. Undefined verb: " + token_text );
        debugger;
      }else{
        verb_id = tag( token_text );
        done = true;
      }

    // In Inox dialect some verbs are special
    }else if( !done ){

      is_special_form = !is_int && is_special_verb( token_text );

      if( !is_special_form && !is_int ){
        if( !verb_exists( token_text ) ){
          parse_de&&bug( S()+ "Parser. Undefined verb: " + token_text );
          breakpoint();
          // ToDo: warning, user enabled
          // debugger;
        }else{
          verb_id = tag( token_text );
        }
      }

    }

    // If existing verb, we're almost done
    if( verb_id != 0 ){

      is_operator = !is_forth && !!is_operator_verb( verb_id );

      // If operator, transform order to get to RPN, Reverse Polish Notation
      if( is_operator
      && ( ! parsing( parse_definition ) && ! parsing( parse_block ) )
      && ( parsing( parse_call )
        || parsing( parse_subexpr )
        || parsing( parse_infix )
        || parsing( parse_keyword )
        || true
      )){

        if( ! parsing( parse_call )
        &&  ! parsing( parse_call_block )
        &&  ! parsing( parse_subexpr )
        &&  ! parsing( parse_infix )
        &&  ! parsing( parse_keyword )
        )debugger;

        // If after another operator, left association
        // ToDo: configurable associativity and precedence
        if( parsing( parse_infix ) ){
          parse_leave();
        }

        // Otherwise processing occurs later at ; or start of keyword
        parse_enter( parse_infix, token_text );
        parse_verb = verb_id;
        continue;
      }

      is_operator = false;

      // keyword calls and sub expressions
      if( parse_depth > 0
      &&  parse_verb == 0
      ){

        // If building a keyword method call
        if( parsing( parse_keyword ) && teq( last_ch, ":" ) ){
          // ToDo: update stack, ie parse_level.name += token_text;
          parse_name += token_text;
          eval_de&&bug( S()+ "Eval. Collecting keywords:" + parse_name );
          continue;
        }
      }

    }

    // If known verb, run it or add it to the new verb beeing built
    // Unless operators or xxx{
    if( verb_id != 0 && !is_operator && !teq( last_ch, "{" ) ){
      eval_do_machine_code( verb_id );
      continue;
    }

    de&&mand( tok_type( token_type_word ) || tok_type( token_type_indent ) );

    // . or ; end of definition of the new Inox verb reached
    if( eval_is_compiling()
    && tok( end_define )
    && parsing( parse_definition )
    ){
      eval_definition_end();
      continue;
    }

    // xxx: piece of a keyword call
    // This is inspired by Smalltalk's syntax.
    // See https://learnxinyminutes.com/docs/smalltalk/
    if( !done && teq( last_ch, ":" ) ){
      // first close all previous nested infix operators
      if( parsing( parse_infix ) ){
        parse_leave();
      }
      // If already collecting keywords of call, add new keyword item
      if( parsing( parse_keyword ) ){
        // ToDo: update stack, ie parse_level.name += token_text;
        parse_name += token_text;
      // If first element of a xxx: aaa yyy: bbb keyword call
      }else{
        parse_enter( parse_keyword, token_text );
      }
      continue;
    }

    // ( of xxx(  or ( of ( sub expression )
    if( !done && teq( last_ch, "(" ) ){
      // if ( of ( expr )
      if( token_length == 1 ){
        parse_enter( parse_subexpr, no_text );
      // if ( of xxx(
      }else{
        parse_enter( parse_call, operandX_( token_text ) );
      }
      done = true;

    // { of xxx{ or { of { block }
    }else if( teq( last_ch, "{" ) ){

      // { start of a block
      if( token_length == 1 ){
        if( eval_is_compiling() ){
          eval_block_begin( no_text );
        // If { start of a block but not within a definition
        }else{
          // ToDo: handle this case, avoiding memory leak
          trace( S()
            + "Cannot compile block, not in a definition, "
            + "at line "  + N( token_line_no )
            + ", column " + N( token_column_no )
          );
          debugger;
        }
        done = true;

      // if xxx{
      }else{
        if( eval_is_compiling() ){
          // parse_enter( parse_call_block, eval_token_value );
          eval_block_begin( token_text );
          parse_de&&bug( S()+ "Eval. Block call:" + parse_name );
          done = true;
        }else{
          trace( S()
            + "Cannot compile block, not in a definition, "
            + "at line "  + N( token_line_no )
            + ", column " + N( token_column_no )
          );
          debugger;
        }
      }

    // } end of a { block } or end of a xxx{
    }else if( !done && teq( last_ch, "}" ) ){

      if( parsing( parse_call_block ) ||  parsing( parse_block ) ){

        // If end of a xxx{
        if( parsing( parse_call_block ) ){
          call_verb_name = parse_name;
          eval_block_end();
          // If .xxx{ call
          if( tlen( call_verb_name ) > 1
          &&  teq(
            /**/ call_verb_name[0],
            //c/ call_verb_name.at( 0 ),
             "."
            ) // ToDo: first_ch?
          ){
            eval_do_tag_literal( operand_X( call_verb_name ) );
            eval_do_machine_code( tag_run_method_by_name );
          // If xxx{ call
          }else{
            if( verb_exists( call_verb_name ) ){
              verb_id = tag( call_verb_name );
              eval_do_machine_code( verb_id );
            }else{
              eval_do_text_literal( call_verb_name );
              eval_do_machine_code( tag_missing_verb );
              if( warn_de ){
                trace( S()+ "Warning, missing verb, " + call_verb_name );
                debugger;
              }
            }
          }

        // if } end of a { block }
        }else{
          eval_block_end();
        }

        // if }abc also name result
        if( token_length > 1 ){
          eval_do_tag_literal( operand_X( token_text ) );
          eval_do_machine_code( tag_rename );
        }

      // Premature/unexpected }
      }else{
        trace( S()
          + "Parser. Nesting warning, unexpected } "
          + " at line " + N( token_line_no )
          + ", column " + N( token_column_no )
          + ", while expecting the end of "
          + parse_type_to_text( parse_type )
        );
        done = true;
      }

      done = true;

    // ) end of a ( sub expression ) or end of xxx( function call
    }else if( !done && teq( first_ch, ")" ) ){

      if( parsing( parse_subexpr ) ||  parsing( parse_call ) ){

        if( parsing( parse_call ) ){

          call_verb_name = parse_name;

          // ) of .xxx( )
          if( tlen( call_verb_name ) > 1
          &&  teq(
            /**/ call_verb_name[0],
            //c/ call_verb_name.at( 0 ),
            "."
            )
          ){
            // ToDo: what would be the meaning of .( xxxx ) ?
            // It could call some xxxx.call method of the target object
            // popped from the data stack. This would be convenient
            // for verb value and some block, /**/ function, callable, etc, objects.
            // ToDo: should it be a tag or a text literal?
            eval_do_tag_literal( operand_X( call_verb_name ) );
            eval_do_machine_code( tag_run_method_by_name );

          // ) of xxx( )
          }else{
            verb_id = tag( call_verb_name );
            // ToDo: update stack, ie parse_level.verb = verb_id;
            parse_verb = verb_id;
            if( verb_id ){
              eval_do_machine_code( parse_verb );
            }else{
              eval_do_text_literal( call_verb_name );
              eval_do_machine_code( tag_missing_verb );
              if( warn_de ){
                trace( "Warning, missing verb, " + call_verb_name );
                debugger;
              }
            }
          }
        }

        // If )abc, name result
        if( token_length > 1 ){
          eval_do_tag_literal( operand_X( token_text ) );
          eval_do_machine_code( tag_rename );
        }

        parse_leave();

      // Premature/unexpected )
      }else{
        bug( S()
          + "Parser. Nesting warning, unexpected ) "
          + " at line " + N( token_line_no )
          + ", column " + N( token_column_no )
          + ", while expecting the end of "
          + parse_type_to_text( parse_type )
        );
      }
      done = true;

    // ; (or .) marks the end of the keyword method call, if any
    }else if( !done
    && ( tok( ";" )
      || tok( end_define ) )
    && parsing( parse_keyword )
    // ToDo: }, ) and ] should also do that
    ){

      while( parsing( parse_keyword ) ){

        // .xx: ... yy: ... ; keyword method call
        if( teq(
          /**/ parse_name[0],
          //c/ parse_name.at( 0 ),
           "."
        ) ){
          // ToDo: should it be a tag or a text literal?
          // Hint: use a tag if it already exist? a text otherwise?
          eval_do_tag_literal( tcut( parse_name, 1 ) );
          eval_do_machine_code( tag_run_method_by_tag );

        // not a keyword method call
        }else{

          // If not multipart, remove trailing :
          if( tidx( parse_name, ":" ) == tlen( parse_name ) - 1 ){
            // ToDo: update stack, ie parse_level.name = tcut( parse_level_name, -1 );
            parse_name = tcut( parse_name, -1 );
          }

          // If verb does not exist, use missing-verb instead
          if( !verb_exists( parse_name ) ){
            eval_do_text_literal( parse_name );
            eval_do_machine_code( tag_missing_verb );
            if( warn_de ){
              trace( parse_name );
              trace( "Warning, missing verb" );
            }
          }else{
            verb_id = tag( parse_name );
            eval_do_machine_code( verb_id );
          }
        }
        parse_leave();
        done = true;

        // Close all calls if terminating ., not when ;
        if( tok( ";" ) )break;

      }

      // dot should close every levels up to the definition one
      if( tok( end_define ) ){
        back_token_type = token_type;
        back_token_text = token_text;
        // ToDo: handle position, line, column of back token
      }

    }else if( !done && is_special_form ){
      done = true;

      // if #xx# it's a verb
      if( teq( first_ch, "#" )
      &&  teq( last_ch,  "#" )
      &&  token_length > 2
      ){
        eval_do_verb_literal( operand_X_( token_text ) );

      // /xxx or #xxx, it's a tag
      } else if( teq( first_ch, "/" ) ||  teq( first_ch, "#" ) ){
        eval_do_tag_literal( operand_X( token_text ) );

      // xxx/ or xxx#, it's a tag too.
      }else if( teq( last_ch, "/" )
      ||        teq( last_ch, "#" )
      ){
        eval_do_tag_literal( operandX_( token_text ) );

      // >xxx!, it's a lookup in the control stack with store
      }else if( teq( first_ch, ">" )
      && teq( last_ch, "!" )
      && token_length > 2
      ){
        eval_do_tag_literal( operand_X_( token_text ) );
        eval_do_machine_code( tag_set_local );

      // >xxx, it's a make in the control stack
      }else if( teq( first_ch, ">" ) ){
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_make_local );

      // xxx>, it's a lookup in the control stack with fetch
      }else if( teq( last_ch, ">" ) ){
        eval_do_tag_literal( operandX_( token_text ) );
        eval_do_machine_code( tag_local );

      // .:xxxx, it's a method call
      }else if( teq( first_ch, "." )
      && token_length > 2
      /**/ && teq( token_text[ 1 ], ":" )
      //c/ && teq( token_text.at( 2 ), ":" )
      ){
        // ToDo: should it be a tag or a text operand?
        eval_do_tag_literal( operand_X( operand_X( token_text ) ) );
        eval_do_machine_code( tag_run_method_by_name );

      // .xxxx!, it's a lookup in an object with store
      }else if( teq( first_ch, "." )
      &&        teq( last_ch,  "!" )
      && token_length > 2
      ){
        eval_do_tag_literal( operand_X_( token_text ) );
        eval_do_machine_code( tag_object_set );

      // .xxxx, it's a lookup in an object with fetch
      }else if( teq( first_ch, "." )
      && token_length > 1
      ){
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_object_get );

      // _xxxx!, it's a lookup in the data stack with store
      }else if( teq( first_ch, "_" )
      &&        teq( last_ch,  "!" )
      && token_length > 2
      ){
        eval_do_tag_literal( operand_X_( token_text ) );
        eval_do_machine_code( tag_set_data );

      // _xxx, it's a lookup in the data stack with fetch
      }else if( teq( first_ch, "_" ) ){
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_data );

      // xxx_, it's a naming operation
      }else if( teq( last_ch, "_" ) ){
        eval_do_tag_literal( operandX_( token_text ) );
        eval_do_machine_code( tag_rename );

      // :xxx, it's a naming operation, explicit, Forth style compatible
      }else if( teq( first_ch, ":" ) ){
        // ToDo: optimize the frequent literal /tag rename sequences
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_rename );

      // xxx:, it's also a naming operation
      }else if( teq( last_ch, ":" ) ){
        eval_do_tag_literal( operandX_( token_text ) );
        eval_do_machine_code( tag_rename );

      // {xxx}, it's a short block about a verb
      }else if( teq( first_ch, "{" )
      &&        teq( last_ch,  "}" )
      && token_length > 2
      ){
        const auto_verb = operand_X_( token_text );
        if( verb_exists( auto_verb ) ){
          eval_do_integer_literal( definition( tag( auto_verb ) ) );
        }else{
          eval_do_tag_literal( token_text );
        }

      // It's not so special after all
      }else{
        done = false;
      }
    }

    // If not done with special verbs, handle integers and undefined verbs
    if( !done ){
      if( is_int ){
        eval_do_integer_literal( text_to_integer( token_text) );
      }else if( teq( first_ch, "-" ) && is_integer( tcut( token_text, 1 ) ) ){
        eval_do_integer_literal(
          - text_to_integer( tcut( token_text, 1 ) )
        );
      }else{
        eval_do_text_literal( token_text );
        eval_do_machine_code( tag_missing_verb );
      }
      done = true;
    }
  }

  de&&mand( done );

  // Empty the parse stack
  de&&mand_eq( stack_length( parse_stack ), 6 );
  parse_leave();
  stack_free( parse_stack );
  parse_stack = 0;

  // Free memory used to compile new definitions, if any
  if( parse_codes != 0 ){
    de&&mand_eq( stack_length( parse_codes ), 0 );
    stack_free( parse_codes );
    parse_codes = 0;
  }

}
primitive( "eval", primitive_eval );


/* ----------------------------------------------------------------------------
 *  Some bootstrap stuff
 */

/*
 *  trace primitive - output text to console.log(), preserve TOS
 */

function primitive_trace(){
  de&&mand_cell_type( TOS, type_text );
  const auto_txt = cell_to_text( TOS );
  clear( POP() );
  // ToDo: output to stdout when running on POSIX systems
  trace( S()+ "\nTRACE " + auto_txt );
}
primitive( "trace", primitive_trace );


/*
 *  inox-out primitive
 */

function primitive_out(){
  primitive_trace();
}
primitive( "inox-out", primitive_out );


/*
 *  trace-stacks primitive
 */

function primitive_trace_stacks(){
  // ToDo: push text instead of using console.log() ?
  trace( S()+ "STACKS TRACE\n" + stacks_dump() );
}
primitive( "trace-stacks", primitive_trace_stacks );


// In some other dialects there are other names for this
function init_alias() : Index {
  define_alias( "sh",     "echo",   "out");
  define_alias( "basic",  "PRINT",  "out" );
  define_alias( "icon",   "write",  "out" );
  define_alias( "python", "print",  "out" );
  define_alias( "c",      "printf", "out" );
  define_alias( "prolog", "write",  "out" );
  return 1;
}
let init_alias_done = init_alias();


/*
 *  ascii-character primitive - return one character text from TOS integer
 */

const tag_ascii = tag( "ascii" );

function primitive_ascii_character(){
  const char_code = eat_integer( TOS );
  /**/ const ch = String.fromCharCode( char_code );
  /*c{
    char chs[ 2 ];
    chs[ 0 ] = (char) char_code;
    chs[ 1 ] = 0;
    Text ch( chs );
  /*c*/
  set_text_cell( TOS, ch );
  set_tos_name( tag_ascii );
}
primitive( "ascii-character", primitive_ascii_character );


/*
 *  ascii-code primitive - return ascii code of first character of TOS as text
 */

function primitive_ascii_code(){
  /**/ const code = cell_to_text( TOS ).charCodeAt( 0 );
  //c/ int code = cell_to_text( TOS ).at( 0 );
  clear( TOS );
  set( TOS, type_integer, code, tag_ascii );
}
primitive( "ascii-code", primitive_ascii_code );


/*
 *  now primitive - return number of milliseconds since start
 */

const tag_now = tag( "now" );

/*c{
int int_now( void ){
  auto delta = std::chrono::milliseconds( now() - time_start );
  long long count = ( long long ) delta.count();
  return static_cast< int >( count );
}
}*/

function primitive_now(){
  /**/ const since_start = now() - time_start;
  //c/ auto since_start = int_now();
  push_integer( since_start );
  set_tos_name( tag_now );
}
primitive( "now", primitive_now );


/*
 *  instructions primitive
 */

const tag_instructions = tag( "instructions" );

function primitive_instructions(){
  push_integer( instructions_total );
  set_tos_name( tag_instructions );
}
primitive( "instructions", primitive_instructions );


/*
 *  the-void primitive - push a void cell
 */

function primitive_the_void(){
  PUSH();
}
primitive( "the-void", primitive_the_void );


/* ----------------------------------------------------------------------------
 *  exports
 */

function evaluate( source_code : TxtC ) : Text {
  push_text( source_code );
  run_eval();
  if( data_stack_is_empty() )return "";
  return pop_as_text();
}


/*
 *  processor() - where things go live
 *
 *  Starts running an Inox machine, returns a json encoded new state (ToDo).
 *  ToDo: return diff instead of new state.
 *  The source parameter is a string, maybe the content of a .nox text file.
 */

/**/ function processor(
/**/   json_state,
/**/   json_event,
/**/   source_code
/**/ ) : string {
//c/ Text processor( TxtC json_state, TxtC json_event, TxtC source_code ){

  // ToDo: restore state and provide event from json encoded values
  // The idea there is about code that can execute in a stateless manner
  // even when some state is required. Basically the whole state is
  // turned into an immutable value and Inox programs simply process
  // that value to produce another value that is a new state.
  // As a result every Inox program could run on any machine and
  // it would be the job of some "orchestration" layer to dispatch
  // jobs and propagate state changes harmoniouly. Not a simple task.
  /**/ let state = JSON.parse( json_state );
  /**/ let event = JSON.parse( json_event );

  // ToDo: build state object and push it onto the data stack.
  // ToDo: build event object and push it onto the data stack.

  // If source code was provided, push it on the parameter stack
  // See http://c2.com/cybords/pp4.cgi?muforth/README

  push_text( source_code );
  run_eval();

  // ToDo: return diff to apply instead of new state
  // ToDo: cell_to_json_text( TOS );
  /**/ let  new_state = JSON.stringify( cell_to_text( TOS ) );
  //c/ Text new_state = cell_to_text( TOS );

  primitive_clear_data();
  primitive_clear_control();

  // ToDo: check that stacks are empty and clear all memory that can be cleared
  return new_state;

} // process()


/* -----------------------------------------------------------------------------
 *  Typescript version of bootstrap and read-eval-print loop
 */


/*
 *  export functions for those who creates javascript primitives
 */

// Not on metal
/*!c{*/

const fun = {
  TOS: () => TOS,
  CSP: () => CSP,
  IP:  () => IP,
  SET_TOS,
  SET_CSP,
  SET_IP,
  POP,
  PUSH,
  RUN,
  type,
  name,
  value,
  tag,
  copy_cell,
  move_cell,
  clear_cell: clear,
  cell_to_text,
  push_text,
  pop_as_text,
  push_integer,
  push_tag,
  push_boolean,
  pop_integer,
  pop_boolean,
  pop_tag,
  memory_dump
}

/*c*/

// console.log( "C SOURCE:\n" + C_source + "\n" );

// ToDo provide a mechanism to register event handlers
function signal( event : TxtC ){
  // ToDo: push event object onto the data stack
  // ToDo: run_verb( "signal" );
}

/**/ function on( event : TxtC, handler : ( e : Text ) => void ){
//c/ void     on( TxtC event,  void (*handler)( TxtC e ) ){
// ToDo: register handler for event in the event handler table.
// Possible events are: "exit", "reset" & "SIGINT"
// ToDo: on micro-controler hardware it could register interupt handlers?
// That would probably require some queueing mechanism and some C coded
// low level handlers when time is critical.
}

// Not on metal
/*!c{*/

const inox_exports = {
  inox,
  fun,
  primitive,
  evaluate,
  processor,
  signal,
  on,
  // ToDo: to_genotype(), from_genotype(), to build & use precompiled species
};

function inox(){
  return inox_exports;
}

/*c*/


/* --------------------------------------------------------------------------
 *  Bootstraping and smoke test.
 */

/*!c{*/

const I   = inox();
const Fun = I.fun;

/*}*/

function eval_file( name : TxtC ){
  /**/ const source_code = require( "fs" ).readFileSync( "lib/" + name, "utf8" );
  /**/ I.processor( "{}", "{}", source_code );
  /*c{
    Text source_code;
    Text filename = S()+ "lib/" + name;
    int fd = open( filename.c_str(), O_RDONLY );
    if( fd < 0 ){
      FATAL( "Can't open file: " + filename );
      return;
    }
    TxtC line;
    while( ( line = fast_getline( fd ) ) != NULL ){
      source_code += line;
    }
    close( fd );
    processor( "{}", "{}", source_code );
  }*/
}


/*
 *  source primitive
 */

function primitive_source(){
// Load a file and evaluate the content
  // ToDo: require, ?require, required?
  // ToDo: include, ?include, included?
  // ToDo: module management
  /**/ eval_file( Fun.pop_as_text() );
  //c/ eval_file( pop_as_text() );
}
/**/ I.primitive( "source", primitive_source );

function bootstrap(){
  eval_file( "bootstrap.nox" );
  eval_file( "forth.nox" );
  if( run_de ){
    eval_file( "test/smoke.nox" );
  }
}

/*c{

void init_globals(){

  // In C++ calls to register primitives using primitive() cannot be done
  // until now, as a result the definition of the verbs that call those
  // is not available until now. This is not a problem in Javascript.
  // See code in build_targets() where all calls to primitive() are
  // collected and then inserted here in the generated C++ source file.
  ALL_PRIMITIVE_DECLARATIONS

}*/

  return_without_parameters_definition
  = definition( tag_return_without_parameters );
  until_checker_definition
  = definition( tag_until_checker );
  while_checker_definition
  = definition( tag_while_checker );
  return_without_it_definition
  = definition( tag_return_without_it );
  assert_checker_definition
  = definition( tag_assert_checker );
  return_without_locals_definition
  = definition( tag_return_without_locals );

  bootstrap();

  time_started = now();

//c/ }


// Pseudo code for a statefull event processor. Async requires promises.
/*
 function processor( identity: string ){
  while( true ){
    const event = await next_event( identity );
    const state = await load_state( identity );
    const source_code = state.source_code;
    const diff = await inox.processor( state, event, source_code );
    const new_state = apply( state, diff )
    await store_state( identity, new_state );
  }
}
*/


/* ----------------------------------------------------------------------------
 *  REPL, Read/Eval/Print/Loop. Interactive shell.
 */

/*!c{*/

function repl(){

  const repl = require( "node:repl" );

  // repl-out primitive

  I.primitive( "repl-out", primitive_repl_dot );
  function                      primitive_repl_dot(){
    process.stdout.write( Fun.pop_as_text() );
  }

  // Redefine basic-out into repl-out
  I.evaluate( "~| redefine output stream |~ to basic-out repl-out." );

  // Define . Forth word, which writes TOS on stdout
  I.evaluate( "( . writes TOS on stdout )  : .  out ;" );

  // Start the REPL, welcome!
  process.stdout.write( "Inox\n" );

  // Display some speed info
  const duration_to_start = now() - time_start;
  process.stdout.write( S()+ duration_to_start + " ms"
  + " and " + (
    Math.ceil( ( instructions_total / duration_to_start )
    / 1000  ) )
  + " Mips to start REPL\n" );

  // ToDo: fill some global ENV object
  // ToDo: push ENV object onto the data stack
  // ToDo: push command line arguments onto the data stack
  const loop = repl.start( {
    prompt: "ok ",
    eval: ( cmd, context, filename, callback ) => {
      const result = I.evaluate( "~~\n" + cmd );
      callback( null, result );
    },
    input:  process.stdin,
    output: process.stdout,
    ignoreUndefined: true,
    writer: result => result
  } );

  loop.setupHistory( ".inox_history", ( err, repl ) => {
    if( err ){
      console.log( S()+ "Inox. Error while loading history: " + err );
    }
  } );

  loop.on( "exit", () => {
    console.log( S()+ "Inox. Received exit event from repl" );
    I.signal( "exit" );
  } );

  loop.on( "reset", () => {
    console.log( S()+ "Inox. Received reset event from repl" );
    I.signal( "reset" );
  } );

  loop.on( "SIGINT", () => {
    console.log( S()+ "Inox. Received SIGINT event from repl" );
    I.signal( "SIGINT" );
    // Should somehow delay the exit until the Inox program has finished
    process.exit();
  } );

} // repl()


// Start the REPL if this file is run directly
if( require && require.main === module ){
  build_targets();
  repl();

// Or else export it together with the inox object
}else{
  inox.repl = repl;
  exports.inox = inox;
}

/*}*/


/* ----------------------------------------------------------------------------
 *  C++ bootstrap and read-eval-print-loop
 */

/**/ time_started = now();


/*c{

void TODO( const char* message ){
  Text buf( "TODO: " );
  buf += message;
  buf += "\n";
  write( 2, buf.c_str(), buf.length() );
}

// void add_history( TxtC line ){
//  TODO( "add_history: free the history when the program exits" );
// }


int repl(){
  char* line;
  while( true ){
    trace( "ok " );
    // Read line from stdin
    line = fast_getline( 0 );
    if( !line ){
      break;
    }
    // ToDo: ? add_history( line );
   trace( evaluate( S() + "~~\n" + line ).c_str() );
  }
  return 0;
}


int main( int argc, char *argv[] ){
  init_globals();
  // ToDo: fill some global ENV object
  // ToDo: ? push ENV object & arguments onto the data stack
  // Display some speed info
  auto duration_to_start = int_now();
  char buf[ 100 ];
  sprintf_s( buf, sizeof( buf ),
    "%d ms and %d Mips to start REPL\n",
    duration_to_start,
    (int) ceil( ( instructions_total / duration_to_start ) / 1000  )
  );
  trace( buf );
  return repl();
}

}*/

// That's all Folks!
