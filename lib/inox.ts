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
 *  It is close enought to WebAssembly and C++. There is no macro processor
 *  in Typescript, so the source code is instrumented with special comments
 *  processed to produce the other targets, specially the C++ target.
 */
 //  _*de*_         to ignore the rest of the line, debug code.
 //  _*as*_         to ignore the rest of the line when in AssemblyScript.
 //  _*as xxxx as*_ to include code when in AssemblyScript only.
 //  _**_           to ignore the rest of the line when in C++.
 //  _*c xxxx c*_   to include code when in C++ only, mono line.
 //  _*!c{*_        to switch to typescript mode.
 //  _*c{           to switch to C++ mode.
 //  _*}{}          to switch from typescript to C++ mode.
 //  }*_            to switch back from C++ to typescript mode.
 // Note: I use _ here instead of / to preserve the comment in C++ code.


/*c{
  #include <iostream>
  #include <string>
  #include <stdbool.h>
  #include <stdint.h>
  using namespace std;
  using namespace std::string_literals;
}*/


/*
 *  Startup time is important these days, let's measure it
 */

/**/  const now = Date.now;

/*c{
  #include <time.h>
  time_t now( void ){
    time_t now;
    time( &now );
    return now;
  }
}*/


/**/  const  time_start = now();
/**/  let    time_started = time_start;

/*c{
  time_t time_start   = now();
  time_t time_started = time_start;
}*/


/*
 *  This is the reference implementation. It defines the syntax and semantic
 *  of the language. Production quality version of the virtual machine would
 *  have to be hard coded in some machine code to be efficient I guess.
 */

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
/**/  type u8  = number;
/**/  type u32 = number;
/**/  type i32 = number;

/*c{

// This code is supposed to be compiled in 32 bits mode. This means that
// all pointers are 32 bits, including pointers returned by malloc() & co.
// There is little need for a 64 bits version at this time (2023). If it were
// to exist, if would make sense to also move cells from 64 bits to 128 bits.

#define USE_INT_ONLY
#ifdef  USE_INT_ONLY
  #define     u8              int
  #define     u32             int
  #define     i32             int
  #define     cast_ptr( p )   ( (int*) (p) )
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

#define     boolean        bool

}*/

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );


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
 */

/**/ let IP : number = 0;
/*c  i32 IP = 0;   c*/

/**/ let TOS : number = 0;
/*c  i32 TOS = 0;   c*/

/**/ let CSP : number = 0;
/*c  i32 CSP = 0;   c*/


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

// Address of a cell's value, type and name
/**/  type    Cell = i32;
/*c   #define Cell   i32   c*/

// Smallest entities at an address in memory
/**/  type    InoxWord = i32;
/*c   #define InoxWord   i32   c*/

// Index in rather small arrays usually, usually positive
/**/  type    Index = i32;
/*c   #define Index   i32   c*/

// A counter, not negative usually
/**/  type    Count = u32;
/*c   #define Count   i32   c*/

// Size of something, in bytes
/**/  type    Size = u32;
/*c   #define Size   unsigned int   c*/

// Size in number of items, often cells
/**/  type    Length  = i32;
/*c   #define Length    i32   c*/

// 0 is false, 1 or anything else is true
/**/ type    Boolean = i32;
/*c  #define Boolean   i32   c*/

// Proxy objects have a unique id, currently an address in the heap
/**/  type    InoxOid = i32;
/*c   #define InoxOid   i32   c*/

// Payload of cell. ToDo: should be an int32
/**/ type    Value = i32;
/*c  #define Value   i32   c*/

// Type & name info parts of a cell
/**/ type    Info = u32;
/*c  #define Info   u32   c*/

// Packed with name, 4 bits, at most 16 types
/**/  type    Type = u8;
/*c   #define Type   u8  c*/

// 28 bits, type + name makes info, total is 32 bits
/**/ type    Name = u32;
/*c  #define Name   u32   c*/

// Synonym for Name. ToDo: should be the address of a definition
/**/ type    Tag = u32;
/*c  #define Tag   u32   c*/

// Shorthand for string, 4 vs 6 letters
/**/ type    text = string;
/*c  #define text   std::string  c*/

/**/ type            Primitive = () => void;
/*c  typedef  void (*Primitive) (void);  c*/

/**/ const no_text = "";
/*c  std::string no_text ( "" );  c*/


/* -----------------------------------------------------------------------------
 *  Let's go.
 *   Some debug tools first.
 */

/**/  import    assert from "assert";
/*c   #include <assert.h>   c*/

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

/**/  let     de = true;
/*c   #define de   true   c*/

// not debug. To easely comment out a de&&bug, add a n prefix
/**/  const   nde = false;
/*c   #define nde   false   c*/


/*
 *  This source file uses multiple debug domains, aka categories.
 *  Some of them are purely there for development, some are useful
 *  for production.
 */

/*
 *  'mem_de' is a low level memory access debug domain.
 *  It should be disabled in production.
 */

/**/  let     mem_de = true;
/*c   #define mem_de   true   c*/

/*
 *  'alloc_de' is there to help debug the dynamic memory allocator.
 *  It should be disabled in production. Among other things, it performs
 *  some integrity checks on the heap.
 */

/**/ let     alloc_de = true;
/*c  #define alloc_de   true   c*/

/*
 *  'check_de' is about runtime error checking.
 *  It may be disabled in production if the source code is trusted.
 *  If the source code may raise typing errors or some other errors,
 *  then it should be enabled in production. Code without checking
 *  runs faster.
 */

let check_de = true;

/*
 *  'warn_de' is about warning messages that are not errors but look like
 *  they could be errors. It's useful to debug the code that is responsible
 *  for raising warnings.
 *  It should be disabled in production.
 *  It's useful for development and debugging.
 */

let warn_de = true;

/*
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

let token_de = true;

/*
 * 'parse_de' enables traces about parsing. This is the second step
 *  of the compilation process. It's useful to debug the parser that
 *  is responsible for compiling verb definitions. As in Forth, the
 *  parser is also an evaluator that runs the source code when it is
 *  not defining a verb.
 */

let parse_de = true;

/*
 *  'eval_de' enables traces about evaluation. This is mixed with parsing
 *  because the parser is also an evaluator. It's useful to debug the
 *  parser/evaluator that is used for the REPL, the interactive mode with
 *  the read-eval-print loop.
 */

let eval_de = true;

/*
 *  'run_de' enable trace is about execution. It's useful to debug the
 *  verb runner that is responsible for executing the code that was
 *  compiled by the parser when defining verbs.
 */

let run_de = true;

/*
 *  'stack_de' enables traces about the stacks. It's useful to debug
 *  changes to the stacks. Note that this flag does not command the
 *  stack overflow/underflow checking, it only enables traces about the stacks.
 */

let stack_de = true;

/*
 *  'step_de' enables traces about the execution of each step of both
 *  the parser/evaluator and the verb runner. It enables step by step
 *  debugging of the code.
 */

let step_de = true;  // Invoke debugger before each step


/* ----------------------------------------------------------------------------
 *  First, let's define what kind of debugging we want. debug() is maximal,
 *  no_debug() is minimal, no_debug_at_all() is without any checking of
 *  both types and memory, fast but perilous.
 *  The default should normally be no_debug().
 */

/**/  debug();
// /**/  no_debug();
// /**/  no_debug_at_all();


/* ----------------------------------------------------------------------------
 *  Let's define the three main modes of operation depending on the debug
 *  level, ie Inox machine debugging, application debugging or production.
 */

/*
 *  Kernel mode, with lots of traces and step by step debugging.
 *  This is the mode when debugging the Inox interpretor itself.
 */

/**/ function debug()      {
/*c  void     debug( void ){  c*/
  /**/  de = true;
  /**/  mem_de = alloc_de = true;
  check_de = true;
  token_de = parse_de = eval_de = run_de = stack_de = step_de = true;
}


/*
 *  Normal mode, with error checking only, no traces.
 *  This is the mode when debugging an application written in Inox.
 *  It's also the mode when running the application in production unless
 *  the application is fully trusted.
 */

/**/ function no_debug()      {
/*c  void     no_debug( void ){  c*/
  debug();
  token_de = parse_de = eval_de = run_de = stack_de = step_de = false;
}


/*
 *  Fast mode, no type checking, no traces. This is the mode when running
 *  the application in production if the application is fully trusted.
 *  It's also the mode when running the application in production if some
 *  orchestration layer monitors the execution and catches errors.
 */

/**/ function no_debug_at_all()      {
/*c  void     no_debug_at_all( void ){  c*/
  no_debug();
  /**/  de       = false;
  /**/  mem_de   = false;
  /**/  alloc_de = false;
  check_de = false;
}


/*
 *  Global flag to filter out all console.log until one needs them.
 *  See inox-log primitive to enable/disable traces.
 */

let can_log = false;


/* -----------------------------------------------------------------------------
 *  Helper functions to deal with Typescript and C++ strings
 *  in a way that is compatible with both languages.
 *
 *  tcut(), tbut() and tmid() to extract sub part of the text.
 *  S(), N(), P() and F() to concatenate text and numbers.
 */

/*
 *  S() - start of text concatenation operations.
 *    Usage: x = S()+ "ab" + "c" + N( 123 ) + "de" + "f"
 */

/**/ function S(){ return ""; }
/*c  std::string S(){ return std::string( "" ); }  c*/


/*
 *  N( n ) - convert a number to a text.
 *    Usage: S()+ "Some:" + N( 123 ) + "."
 */

/**/ function N( n ){ return "" + n; }
/*c  std::string N( int n ){ return std::to_string( n ); }  c*/


/*
 *  F( fn ) - convert a function name/pointer to a text.
 */

/**/ function F( fn : Function ){ return fn.name }
/*c std::string _F( void* fn ){ return N( (int) fn ); } c*/
/*c #define F( fn ) _F( (void*) fn )  c*/


/*
 *  P( p ) - convert a pointer to a text.
 */

/**/ function P( p : any ){ return N( p ); }
/*c std::string P( void* p ){ return N( (int) p ); }  c*/


/*
 *  tlen( text )
 *    Return the length of the text.
 *    UTF-8 characters are counted as one character / one byte.
 */

/**/ function tlen( s : string ){ return s.length; }
/*c  int tlen( std::string s ){ return s.length(); }  c*/


/*
 *  tbut( text, n )
 *    Return text minus the first n characters, minus last if n is negative.
 *    I.e. all "but" the first n characters.
 */

/**/ function tbut( s : string, n : number ){ return s.slice( n ); }

/*c

std::string tbut( std::string& s, int n ){
  if( n > 0 ){
    return s.substr( n, s.length() - n );
  }else{
    return s.substr( 0, s.length() + n );
  }
}

c*/


/*
 *  tcut( text, n )
 *    Return n first characters of text, last characters if n is negative.
 *    I.e. a "cut" of the first n characters off the whole text.
*/

/**/ function tcut( s : string, n : number ){ return s.slice( 0, n ); }
/*c
std::string tcut( std::string& s, int n ){
  if( n > 0 ){
    return s.substr( 0, n );
  }else{
    return s.substr( s.length() + n, -n );
  }
}
c*/


/*
 *  tmid( start, end )
 *     Return characters of text between start (included ) and end (excluded).
 *     If start is negative, it's counted from the end of the text.
 *     If end is negative, it's counted from the end of the text.
 *     I.e. a "mid" part of the whole text, in the middle.
 */

/**/ function tmid( t : string, start : number, end : number ){
/**/   const s = start >= 0 ? start : t.length + start;
/**/   const e = end   >= 0 ? end   : t.length + end;
/**/   return t.substring( s, e );
/**/ }

/*c

std::string tmid( std::string& t, int start, int end ){
  int s = start >= 0 ? start : t.length() + start;
  int e = end >= 0 ? end : t.length() + end;
  return text.substr( start, end - start);
}

c*/


/*
 *  teq( text1, text2 ) - teq, text equality.
 *    Return true if two texts are the same text.
 */

/**/ function teq( s1 : string, s2 : string ) : boolean {
/*c  bool     teq( std::string& s1, std::string& s2 ) {   c*/
  return s1 == s2;
}

// C++ overloaded functions, depending on string representation

/*c

bool teq( std::string& s1, char* s2 ) {
  return s1 == s2;
}

bool teq( char* s1, std::string& s2 ) {
  return s2 == s1;
}

bool teq( std::string& s1, char s2 ) {
  if( s1.empty() )return s2 == 0;
  return s.length() == 1 && s1[ 0 ] == s2;
}

bool teq( char s1, char s2 ) {
  return s1 == s2;
}

c*/


/*
 *  tneq( text1, text2 ) - tneq, text not equal.
 *    Return true if two texts are not the same text.
 *   I.e. the opposite of teq().
 */

/**/ function tneq( s1 : string, s2 : string ) : boolean {
/*c  bool     tneq( std::string& s1, std::string& s2 ) {   c*/
  return s1 != s2;
}

// C++ overloaded functions, depending on string representation
/*c

bool tneq( std::string& s1, char* s2 ) {
  return s1 != s2;
}

bool tneq( char* s1, std::string& s2 ) {
  return s2 != s1;
}

bool tneq( std::string& s1, char s2 ) {
  if( s1.empty() )return s2 != 0;
  return s1.length() != 0 || s1[ 0 ] != s2;
}

bool tneq( char s1, char s2 ) {
  return s1 != s2;
}

c*/


/*
 *  tidx() - index of substring in text, -1 if not found
 */

/**/ function tidx( s : string,     sub : string     ) : Index {
/*c  int      tidx( std::string& s, std::string& sub )         {  c*/
  /**/ return s.indexOf( sub );
  /*c  return s.find( sub );  c*/
}


/*
 *  tidxr() - index of substring in text, -1 if not found
 */

/**/ function tidxr( s : string,     sub : string     ) : Index {
/*c  int      tidxr( std::string& s, std::string& sub )         { c*/
  /**/ return s.lastIndexOf( sub );
  /*c  return s.rfind( sub );  c*/
}


/* -----------------------------------------------------------------------------
 *  logging/tracing
 */

/*
 *  Global flag to filter out all console.log until one needs them.
 *  See inox-log primitive to enable/disable traces.
 */

/**/  const console_log = console.log;
/**/  let     bug = !can_log ? trace : console_log;
/*c   #define bug( a_message ) ( trace( a_message ) )  c*/


/*
 *  trace() is the default trace function. It's a no-op if can_log is false.
 *  It's a wrapper around console.log() if can_log is true.
 */

/**/ function trace( msg ){
/**/    // de&&bug( a_message ) to log a message using console.log()
/**/    if( !can_log ){
/**/      // See primitive inox-log
/**/      bug = console_log;
/**/      return;
/**/    }
/**/    // AssemblyScript supports a simpler version of console.log()
/**/    assert( typeof msg == "string" );
/**/    console_log( msg );
/**/  }


/*c

void trace( std::string& msg ){
  if( !can_log )return;
  cout << msg;
}

void debugger_function( void ){
  // Invoke the debugger if there is one, platform dependent
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

c*/


/**/ function breakpoint() : void {
/*c  void     breakpoint() {  c*/
  /*de*/ debugger;
  trace_context( "BREAKPOINT\n" );
  debugger;
}


/* ----------------------------------------------------------------------------
 *  'mand' is short for "demand" or "mandatory". It's a function that that
 *  checks if a condition is true. If it's not, it raises an exception. This
 *  implements assertions checking.
 *  There are various flavors of mand() to check various types of conditions.
 */


/**/ function mand( condition : boolean ) : boolean {
/*c  bool     mand( int condition ){   c*/
// de&&mand( a_condition ), aka asserts. Return true if assertion fails.
  // ToDo: should raise an exception?
  if( condition )return true;
  breakpoint();
  assert( false );
  return false;
};


/**/ function mand2( condition : boolean, msg : string ) : boolean {
/*c  bool     mand2( int condition,       std::string& msg ){  c*/
// Like mand() but with a message
  if( condition )return true;
  bug( msg );
  breakpoint();
  assert( false );
  return false;
}


/**/ function mand_eq( a : i32, b : i32 ) : boolean {
/*c  bool     mand_eq( int a, int b ){   c*/
  // Check that two values are equal
  if( a == b )return true;
  /**/  mand2( false, "bad eq " + a + " / " + b );
  /*c   mand2( false, "bad eq" );   c*/
  return false;
}


/**/ function mand_neq( a : i32, b : i32 ) : boolean {
/*c  bool     mand_neq( int a, int b ){   c*/
  if( a != b )return true;
  breakpoint();
  /**/  mand2( false, "bad neq " + a + " / " + b );
  /*c   mand2( false, "bad neq" );   c*/
  return false;
}


/* -----------------------------------------------------------------------------
 *  First, make it work in the javascript machine, it's the portable scheme.
 *  When compiled using AssemblyScript some changes will be required.
 */

/**/ de&&bug( "Inox is starting." );


/* -----------------------------------------------------------------------------
 *  Memory is made of words that contains cells. Cells are made of a value and
 *  informations, info. Info is the type and the name of the value. See pack().
 */

/**/  const   size_of_word    = 8;  // 8 bytes, 64 bits
/*c   #define size_of_word      8   c*/

/**/  const   size_of_value   = 4;  // 4 bytes, 32 bits
/*c   #define size_of_value     4   c*/

/**/  const   size_of_info    = 4;  // type & name, packed
/*c   #define size_of_info      4   c*/

/**/  const   size_of_cell    = size_of_value + size_of_info;
/*c   #define size_of_cell      ( size_of_value + size_of_info )   c*/

/**/  const   words_per_cell  = size_of_cell  / size_of_word;
/*c   #define words_per_cell    ( size_of_cell  / size_of_word )   c*/

/**/  const   ONE             = words_per_cell;
/*c   #define ONE               words_per_cell   c*/

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


// This is "the data segment" of the virtual machine.
// the "void" first cell is allocated at absolute address 0.
// It's an array of 64 bits words indexed using 28 bits addresses.
// That's a 31 bits address space, 2 giga bytes, plenty.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html


// That the flat memory where the Inox interpretor will run
// ToDo: make the size configurable at run time
// Current default is 256 kb
/**/ const   INOX_HEAP_SIZE =   1024 * 256;
/*c  #define INOX_HEAP_SIZE   ( 1024 * 256 )   c*/


// The flat memory is accessed differently depending on the target
/**/ const mem8  = new ArrayBuffer( INOX_HEAP_SIZE  ); // 256 kb
/**/ const mem32 = new Int32Array( mem8 );
// ToDo: with AssemblyScript const mem64 = new Int64Array( mem8 );


// Write access to that cell triggers a debugger breakpoint in debug mode
/*de*/ let breakpoint_cell = 100000;
 /*de*/ breakpoint_cell = 0;

/*
 *  set_value() and set_info() are the only way to write to memory
 */

/**/ function set_value( c : Cell, v : Value ) : void  {
/**/   if( de && c == breakpoint_cell )debugger;
/**/   mem32[ c << 1 ] = v |0;
/**/ }

// On metal, direct access to memory
/*c
#define set_value( c, v )  ( *cast_ptr( c << 4 ) = v );
c*/

/**/ function set_info( c : Cell, i : Info  ) : void  {
/**/   /*de*/ if( de && c == breakpoint_cell )debugger;
/**/   mem32[ ( c << 1 ) + 1 ] = i |0;
/**/ }

// On metal
/*c
#define set_info( c, i )  ( *cast_ptr( ( c << 4 ) + 4 ) = i )
c*/


/*
 *  value() and info() are the only way to read from memory
 */

/**/  function value( c : Cell ) : Value {
/**/    // return mem64[ c ] & 0xffffffff
/**/    return mem32[ c << 1 |0 ];
/**/  }

// On metal
/*c
#define value( c )  ( *cast_ptr( c << 4 ) & 0xffffffff )
c*/


/**/  function info( c : Cell ) : Info {
/**/    // return mem64[ c ] >>> 32;
/**/    return mem32[ ( c << 1 ) + 1 ] |0;
/**/  }

// On metal
/*c
#define info( c )  ( *cast_ptr( ( c << 4 ) + 4 ) )
c*/


/*
 *  reset() is the way to clear a cell
 */

/**/  function reset( c : Cell ) : void {
/**/    /*de*/ if( de && c == breakpoint_cell )debugger;
/**/    // mem64[ c ] = 0;
/**/    mem32[   c << 1       ] = 0;
/**/    mem32[ ( c << 1 ) + 1 ] = 0;
/**/  }

// On metal
/*c
#define reset( c )  ( *cast_ptr( c << 4 ) = 0, *cast_ptr( ( c << 4 ) + 4 ) = 0 )
c*/


/*
 *  reset_value()
 */

/**/  function reset_value( c : Cell ) : void {
/**/    /*de*/ if( de && c == breakpoint_cell )debugger;
/**/    mem32[ c << 1 ] = 0;
/**/  }

// On metal
/*c
#define reset_value( c )  ( *cast_ptr( c << 4 ) = 0 )
c*/


/*
 *  reset_info()
 */

/**/  function reset_info( c : Cell ) : void {
/**/    /*de*/ if( de && c == breakpoint_cell )debugger;
/**/    mem32[ ( c << 1 ) + 1 ] = 0;
/**/  }

// On metal
/*c
#define reset_info( c )  ( *cast_ptr( ( c << 4 ) + 4 ) = 0 )
c*/


/*
 *  init_cell() to initialize a cell to zeros
 */

// Not on metal
/*!c{*/

function init_cell( c : Cell, v : Value, i : Info ) : void{
  if( de && c == breakpoint_cell )debugger;
  // mem64[ c ] = v | ( i << 32 );
  mem32[   c << 1       ] = v |0;
  mem32[ ( c << 1 ) + 1 ] = i |0;
}

// On metal
/*}{

void init_cell( Cell c, Value v, Info i ) {
  *cast_ptr(   c << 4 ) = v;
  *cast_ptr( ( c << 4 ) + 4 ) = i;
}

}*/


/*
 *  init_copy_cell() to initialize a cell to the value of another one
 */

// Not on metal
/*!c{*/

function init_copy_cell( dst : Cell, src : Cell ) : void {
// Initialize a cell, using another one, raw copy.
  if( de && dst == breakpoint_cell )debugger;
  mem32[   dst << 1       ] = mem32[   src << 1       ] |0;
  mem32[ ( dst << 1 ) + 1 ] = mem32[ ( src << 1 ) + 1 ] |0;
}

// On metal
/*}{

#define init_copy_cell( dst, src )  ( \
 *cast_ptr(   dst << 4 )       = *cast_ptr(   src << 4 ), \
 *cast_ptr( ( dst << 4 ) + 4 ) = *cast_ptr( ( src << 4 ) + 4 ) \
)

}*/


/*
 *  packing and unpacking of type and name
 */

// Not on metal
/*!c{*/

function pack( t : Type, n : Tag ) : Info { return n | t << 28;              }
function unpack_type( i : Info )   : Type { return i >> 28;                  }
function unpack_name( i : Info )   : Tag  { return i & 0xffffff;	           }
function type( c : Cell )          : Type { return unpack_type( info( c ) ); }
function name( c : Cell )          : Tag  { return unpack_name( info( c ) ); }

// On metal
/*}{

#define pack( t, n )       ( ( n ) | ( t ) << 28 )
#define unpack_type( i )   ( ( i ) >> 28 )
#define unpack_name( i )   ( ( i ) & 0xffffff )
#define type( c )          ( unpack_type( info( c ) ) )
#define name( c )          ( unpack_name( info( c ) ) )

}*/

/*
 *  set_type() and set_name()
 */

// Not on metal
/*!c{*/

function set_type( c : Cell, t : Type ) : void {
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


function set_name( c : Cell, n : Tag ) : void {
// The name of the tag cell that defines the tag must never change.
  if( de && type( c ) == type_tag && c == value( c ) ){
    de&&mand_eq( n, c );
  }
  set_info( c, pack( unpack_type( info( c ) ), n ) );
}


// On metal
/*}{

#define set_type( c, t )  ( set_info( c, pack( t, unpack_name( info( c ) ) ) ) )
#define set_name( c, n )  ( set_info( c, pack( unpack_type( info( c ) ), n ) ) )

}*/


/*
 *  small test suite for pack() and unpack()
 */

// Not on metal
/*!c{*/

function test_pack(){
  // copilot generated code
  de&&mand( pack( 0, 0 ) === 0 );
  de&&mand( pack( 1, 0 ) === 1 << 28 );
  de&&mand( pack( 0, 1 ) === 1 );
  de&&mand( pack( 1, 1 ) === ( 1 << 28 ) + 1 );
  de&&mand( unpack_type( pack( 0, 0 ) ) === 0 );
  de&&mand( unpack_type( pack( 1, 0 ) ) === 1 );
  de&&mand( unpack_type( pack( 0, 1 ) ) === 0 );
  de&&mand( unpack_type( pack( 1, 1 ) ) === 1 );
  de&&mand( unpack_name( pack( 0, 0 ) ) === 0 );
  de&&mand( unpack_name( pack( 1, 0 ) ) === 0 );
  de&&mand( unpack_name( pack( 0, 1 ) ) === 1 );
  de&&mand( unpack_name( pack( 1, 1 ) ) === 1 );
  const test_cell = 0;
  const save_breakpoint = breakpoint_cell;
  breakpoint_cell = 1;
  set_value( test_cell, 0 );
  de&&mand( value( test_cell ) === 0 );
  set_value( test_cell, 1 );
  de&&mand( value( test_cell ) === 1 );
  set_info( test_cell, 0 );
  de&&mand( info( test_cell ) === 0 );
  set_info( test_cell, 1 );
  de&&mand( info( test_cell ) === 1 );
  init_cell( test_cell, 0, 0 );
  de&&mand( value( test_cell ) === 0 );
  de&&mand( info( test_cell ) === 0 );
  init_cell( test_cell, 1, 1 );
  de&&mand( value( test_cell ) === 1 );
  de&&mand( info( test_cell ) === 1 );
  init_cell( test_cell, 0, 1 );
  de&&mand( value( test_cell ) === 0 );
  de&&mand( info( test_cell ) === 1 );
  init_cell( test_cell, 1, 0 );
  de&&mand( value( test_cell ) === 1 );
  de&&mand( info( test_cell ) === 0 );
  reset( 0 );
  de&&mand( value( test_cell ) === 0 );
  de&&mand( info( test_cell ) === 0 );
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
 *  half of them, but faster.
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

/**/ const   type_void = 0;
/*c  #define type_void   0  c*/

/**/ const   type_boolean  = 1;
/*c  #define type_boolean    1  c*/

/**/ const   type_tag = 2;
/*c  #define type_tag    2  c*/

/**/ const   type_integer  = 3;
/*c  #define type_integer    3  c*/

/**/ const   type_reference = 4;
/*c  #define type_reference  4  c*/

/**/ const   type_proxy = 5;
/*c  #define type_proxy 5  c*/

/**/ const   type_text = 6;
/*c  #define type_text 6  c*/

/**/ const   type_verb = 7;
/*c  #define type_verb 7  c*/

/**/ const   type_flow = 8;
/*c  #define type_flow 8  c*/

/**/ const   type_list = 9;
/*c  #define type_list 9  c*/

/**/ const   type_invalid = 10;
/*c  #define type_invalid 10  c*/


/*
 *  Cell allocator
 */

// cell number 0 is reserved, special, 0/0/0, void/void/void
const cell_0 = 0;

// Some basic memory allocation, purely growing.
// This is like sbrk() on Unix
// See https://en.wikipedia.org/wiki/Sbrk
// Smart pointers use a malloc/free scheme with reference counters.

// This last cell would be HERE in Forth
// See https://forth-standard.org/standard/core/HERE
let the_next_free_cell = 0;


/**/ function allocate_cells( n : Count ) : Cell {
/*c  Cell     allocate_cells( Count n ) {   c*/
  // Allocate a number of consecutive cells. Static. See also allocate_bytes().
  // Cells allocated this way are not freeable unless very quickly.
  // if( n > 3 )debugger;
  /*de*/ if( de && debug_next_allocate != 0 ){
  /*de*/   debug_next_allocate = the_next_free_cell - debug_next_allocate;
  /*de*/   debugger;
  /*de*/   debug_next_allocate = 0;
  /*de*/ }
  const cell = the_next_free_cell;
  the_next_free_cell += n * ONE;
  return cell;
}


// This is initialy the sentinel tail of the list of reallocatable cells
let nil_cell = 0; // it will soon be the void/void/void cell

// Linked list of free cells.
let the_first_free_cell = 0;


/*de*/ let debug_next_allocate : Cell = 0;


/**/ function allocate_cell() : Cell {
/*c Cell      allocate_cell() {   c*/
  // Allocate a new cell or reuse a free one
  /*de*/ if( de && debug_next_allocate != 0 ){
  /*de*/   debug_next_allocate = the_next_free_cell - debug_next_allocate;
  /*de*/   debugger;
  /*de*/   debug_next_allocate = 0;
  /*de*/ }
  let cell = the_first_free_cell;
  if( cell == nil_cell ){
    // The heap grows upward
    cell = the_next_free_cell;
    the_next_free_cell += ONE;
    // ToDo: check that the heap does not overflow
  } else {
    the_first_free_cell = next( cell );
    reset( cell );
  }
  de&&mand( type(  cell ) == 0 );
  de&&mand( name(  cell ) == 0 );
  de&&mand( value( cell ) == 0 );
  return cell;
}


/**/ function free_cell( c : Cell ) : void {
/*c void      free_cell( Cell c ) {   c*/
  // Free a cell, add it to the free list

  // Check that cell is empty
  de&&mand_eq( type(  c ), 0 );
  de&&mand_eq( name(  c ), 0 );
  de&&mand_eq( value( c ), 0 );

  // Special case when free is about the last allocated cell.
  if( c == the_next_free_cell - ONE ){
    // It happens with tempory cells that are needed sometimes.
    // ToDo: get rid of that special case.
    free_last_cell( c );
    return;
  }
  // Else, add cell to the linked list of free cells
  set_next_cell( c, the_first_free_cell );
  the_first_free_cell = c;

}


/**/ function free_last_cell( c : Cell ) : void {
/*c  void     free_last_cell( Cell c ) {   c*/
  // Called by allocate_cell() only
  // ToDo: alloc/free for tempory cells is not efficient.
  de&&mand_eq( c, the_next_free_cell - ONE );
  the_next_free_cell -= ONE;
}


/**/ function free_cells( c : Cell, n : Count ) : void {
/*c  void     free_cells( Cell c, Count n ) {   c*/
  // Free a number of consecutive cells
  // ToDo: not used yet but it would make sense for stack style allocations.
  // If the area is big enough, it is better to add it to the dynamic pool.
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    free_cell( c + ii * ONE );
  }
}


/**/ function mand_empty_cell( c : Cell ) : void {
/*c  bool     mand_empty_cell( Cell c ) {   c*/
  // Check that a cell is empty, 0, 0, 0
  mand_eq( type(  c ), 0 );
  mand_eq( name(  c ), 0 );
  mand_eq( value( c ), 0 );
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


/**/ function mand_list_cell( c : Cell ) : void {
/*c  bool     mand_list_cell( Cell c ) {   c*/
// Check that a cell is a list cell
  /*de*/ mand_eq( name( c ), tag_list );
}


/**/ function next( c : Cell ) : Cell {
/*c  Cell     next( Cell c ) {   c*/
// Assuming cell is a list member, return next cell in list
  // When a cell is unused, the name is changed into "list" and the value
  // is used to store the next cell in some list.
  // ToDo: use a native type instead of this trickery?
  de&&mand_list_cell( c );
  return value( c );
}


/**/ function is_last_cell( c : Cell ) : boolean {
/*c  boolean  is_last_cell( Cell c ) {   c*/
  // Assuming cell is a list member, return true if it is the last cell in list
  de&&mand_list_cell( c );
  return next( c ) == 0;
}


/**/ function set_next_cell( c : Cell, nxt : Cell ) : void {
/*c  void     set_next_cell( Cell c, Cell nxt ) {   c*/
  // Turn cell into a list member, set the next cell in list
  /**/ init_cell( c, nxt, tag_list );
  /*c init_cell( c, nxt, 0 ); c*/
  mem_de&&mand_eq( next( c ), nxt );
}


// Not on metal
/*!c{*/

function copy_cell( source : Cell, destination : Cell ) : void {
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
    // destructors could be processed by inox-return.
    increment_object_ref_count( value( source ) );
  }
}

// On metal, inlined for speed
/*}{

  #define copy_cell( source, destination )  \
  init_copy_cell( destination, source ); \
  if( needs_clear( source ) ){ \
    increment_object_ref_count( value( source ) ); \
  }

}*/


/**/ function move_cell( source : Cell, destination : Cell ) : void {
/*c  void     move_cell( Cell source, Cell destination ) {   c*/
// Move the content of a cell, taking care of clearing the destination first.
  clear( destination );
  init_copy_cell( destination, source );
  reset( source );
}


/**/ function move_cells( source : Cell, target : Cell, length : Length ){
/*c void      move_cells( Cell source,   Cell target,   Length length   ){  c*/
  let ii;
  for( ii = 0 ; ii < length ; ii++ ){
    move_cell( source + ii * ONE, target + ii * ONE );
  }
}


/**/ function raw_move_cell( source : Cell, destination : Cell ) : void {
/*c  void     raw_move_cell( Cell source, Cell destination ) {   c*/
  // Move the content of a cell. Assume destination is empty.
  de&&mand_empty_cell( destination );
  init_copy_cell( destination, source );
  reset( source );
}


/**/ function clear_cell_value( c : Cell ) : void {
/*c  void     clear_cell_value( Cell c ) {   c*/
  de&&mand( ! needs_clear( c ) );
  reset_value( c );
}

// Forward declarations to please C++
/*c bool needs_clear( Cell ); c*/
/*c Length object_length( Cell ); c*/
/*c void free_text( Index ); c*/
/*c void free_proxy( Index ); c*/


/**/ function clear( c : Cell ) : void {
/*c  void     clear( Cell c ) {   c*/
  // If reference, decrement reference counter and free if needed.

  // if( cell == 531 )debugger;

  if( ! needs_clear( c ) ){
    /*de*/ if( de ){
    /*de*/   if( type(  c ) == type_tag
    /*de*/   &&  value( c ) == c
    /*de*/   ){
    /*de*/     FATAL( "clear_cell() on " + dump( c ) );
    /*de*/     return;
    /*de*/   }
    /*de*/ }
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
 *    - the string,     a std::string in C++, a string in typescript
 *    - the primitive,  a void (fn)( void ) in C++, a function in typescript
 *    - the definition, a 28 bits address of the first cell of the definition
 *
 *  This makes a total of 4 x 32 bits words per symbol if compiled for 32 bits
 *  and 2 x 32 bits + 2 x 64 bits words per symbol if compiled for 64 bits. ie
 *  16 bytes per symbol if compiled for 32 bits and 24 bytes per symbol if
 *  compiled for 64 bits. In a addition to that there is the space for the
 *  strings themselves plus the overhead of malloc() about that. That's for
 *  C++, the type script version is a bit different.
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

let all_symbol_cells = 0;

// How many symbols are there already?
let all_symbol_cells_length = 0;

// How many symbols can be stored in the array, total?
let all_symbol_cells_capacity = 0;


// The global array of all symbol texts, an array of strings
// In typescript, those are strings, in C++, it's std::string
/**/ let all_symbol_texts : Array< string >;
/*c  std::string* all_symbol_texts = 0; c*/

// The associated array of definitions, if any
/**/ let    all_definitions : Array< Cell >;
/*c  Cell*  all_definitions = (Cell*) 0;  c*/

// The associated array of primitives, if any
/**/ let all_primitives : Array< Primitive >;
/*c  Primitive* all_primitives = (Primitive*) 0; c*/


// Typescript grows arrays automatically, C++ does not
/*c Length all_primitives_capacity  = 0; c*/
/*c Length all_definitions_capacity = 0; c*/

/*
 *  Init all of that
 */

/**/ function init_symbols(      ) : void {
/*c  int      init_symbols( void )        {  c*/
// Initialize the global arrays of all symbols

  // See tables below, from "void" to "stack", 21 symbols
  all_symbol_cells_length = 21;

  // This 512 should be configurable?
  all_symbol_cells_capacity    = 512;
  /*c all_primitives_capacity  = 512; c*/
  /*c all_definitions_capacity = 512; c*/

  // The lower part of the memory should never be used
  // ToDo: In C++, it should be the result of some big malloc() I guess
  allocate_cells( 16 );

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
    all_symbol_texts = [
      "void",       // 0 - the 16 first symbols must match the type ids
      "boolean",    // 1
      "tag",        // 2
      "integer",    // 3
      "reference",  // 4
      "proxy",      // 5
      "string",     // 6
      "verb",       // 7
      "flow",       // 8
      "list",       // 9
      "invalid",    // 10 - room for future types
      "invalid1",   // 11
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
    all_primitives  = [];
    all_definitions = [];
  /*}{
    // ToDo: Area needs to be clear, see calloc() maybe?
    // Alternatively I could allocate within the symbol table or in a dyn area
    //all_symbol_texts
    //= (char**) calloc( all_symbol_cells_capacity, sizeof( char* ) );
    all_symbol_texts = new std::string[ all_symbol_cells_capacity ];
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
  /*c return 0; c*/
}

/*c const dummy_init_symbols = c*/
init_symbols();


const tag_void      = tag( "void" );
const tag_boolean   = tag( "boolean" );
const tag_tag       = tag( "tag" );
const tag_integer   = tag( "integer" );
const tag_reference = tag( "reference" );
const tag_proxy     = tag( "proxy" );
const tag_text      = tag( "text" );
const tag_verb      = tag( "verb" );
const tag_flow      = tag( "flow" );
const tag_list      = tag( "list" );
const tag_invalid   = tag( "invalid" );
const tag_true      = tag( "true" );
const tag_dynrc     = tag( "_dynrc" );
const tag_dynxt     = tag( "_dynxt" );
const tag_dynsz     = tag( "_dynsz" );
const tag_stack     = tag( "stack" );


/**/ function tag_to_text( t : Tag ) : text {
/*c  std::string    tag_to_text( Index t ) {   c*/
// Return the string value of a tag
  de&&mand( t < all_symbol_cells_length );
  return all_symbol_texts[ t ];
}


/**/ function symbol_to_text( c : Cell ) : string {
/*c  std::string    symbol_to_text( Cell c )          {   c*/
// Return the string value of a cell
  de&&mand_eq( type( c ), type_tag );
  de&&mand_eq( name( c ), value( c ) );
  return all_symbol_texts[ value( c ) ];
}


/**/ function symbol_lookup( name : string ) : Index {
/*c Index     symbol_lookup( std::string& name ) {   c*/
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


/**/ function register_symbol( name : string ) : Index {
/*c  Index    register_symbol( std::string& name  ) {   c*/
// Register a symbol and return its entry number
  const index = symbol_lookup( name );
  // Unless it is already registered
  if( index != 0 || teq( name, "void" ) ){
    return index;
  }
  // Allocate a bigger array if needed, twice the size
  if( all_symbol_cells_length
  ==  all_symbol_cells_capacity
  ){
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
    /**/ const new_texts = new Array< string >( new_capacity );
    // /*c char** new_texts = (char**)calloc( new_capacity, sizeof( char* ) ); c*/
    /*c std::string* new_texts = new std::string[ new_capacity ]; c*/
    // Move the texts from the old to the new array
    let ii;
    for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
      new_texts[ ii ] = all_symbol_texts[ ii ];
      /**/ all_symbol_texts[ ii ] = "";
      /*c all_symbol_texts[ ii ] = no_text; c*/
    }
    all_symbol_texts = new_texts;
  }
  // Add the name to the array
  /**/ all_symbol_texts[ all_symbol_cells_length ] = name;
  /*c all_symbol_texts[ all_symbol_cells_length ] = strdup( name.data() ); c*/
  set(
    all_symbol_cells + all_symbol_cells_length * ONE,
    type_tag,
    all_symbol_cells_length,
    all_symbol_cells_length
  );
  return all_symbol_cells_length++;
}


/**/ function register_primitive( t : Tag, f : Primitive ) : void {
/*c  void     register_primitive( Index t, Primitive f   )        {  c*/
// Register a primitive function
  de&&mand( t < all_symbol_cells_length );
  // Allocate more capacity if needed
  /*c
  if( t >= all_primitives_capacity ){
    int new_capacity = t + 16;
    Primitive* new_primitives
    = (Primitive*) calloc( new_capacity, sizeof( Primitive ) );
    memcpy( new_primitives, all_primitives, all_primitives_capacity );
    free( all_primitives );
    all_primitives          = new_primitives;
    all_primitives_capacity = new_capacity;
  }
  */
  // Register the primitive
  all_primitives[ t ] = f;
}


/**/ function register_definition( t : Tag, c : Cell ) : void {
/*c  void     register_definition( Tag t,   Cell c   )        {  c*/
// Register a definition
  de&&mand( t < all_symbol_cells_length );
  // Allocate more capacity if needed
  /*c{
  if( t >= all_definitions_capacity ){
    int new_capacity = t + 64;
    Cell* new_definitions
    = (Cell*) calloc( new_capacity, sizeof( Cell ) );
    memcpy( new_definitions, all_definitions, all_definitions_capacity );
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
/*c  void     no_operation( void )        {                    }  c*/


/**/ function  get_primitive( t : Tag ) : Primitive {
/*c  Primitive get_primitive( Tag t   )             {  c*/
// Return the primitive function for a tag
  de&&mand( t < all_symbol_cells_length );
  /*!c{*/
    return all_primitives[ t ] || no_operation;
  /*}{
    if( t >= all_primitives_capacity ){
      return (Primitive) 0;
    }
    Primitive p = all_primitives[ t ];
    if( p == (Primitive) 0 ){
      return no_operation;
    }else{
      return p;
    }
  }*/
}


/**/ function get_definition( t : Tag ) : Cell {
/*c  Cell     get_definition( Tag t   )        {  c*/
// Return the definition for a tag
  de&&mand( t < all_symbol_cells_length );
  /*c{
  if( t >= all_definitions_capacity ){
    return (Cell) 0;
  }
  }*/
  return all_definitions[ t ];
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
 *  In C, there is a shadow array of pointers to nul terminated characters.
 */



/**/ function stack_allocate( l : Length ) : Cell {
/*c  Cell     stack_allocate( Length l )          { c*/
// Allocate a stack of length l
  // First cell holds the length of the stack and it's class name
  const a = allocate_area( ( l + 1 ) * size_of_cell );
  // If stack is extensible, ie has an initial length of 0
  if( l == 0 ){
    // Then first cell is a reference to some other stack that may change
    set( a, type_reference, tag_stack, stack_allocate( 1 ) );
  // If stack isn't extensible, then first cell is the length of the stack
  }else{
    set( a, type_integer, tag_stack, 0 );
  }
  // ToDo: should return a + ONE maybe, ie skip the header first cell?
  return a;
}


/**/ function stack_preallocate( l : Length ) : Cell {
/*c  Cell     stack_preallocate( Length l )          { c*/
// Allocate an extensible stack with an initial capacity
  const a = allocate_area( 1 * size_of_cell );
  set( a, type_reference, tag_stack, stack_allocate( l ) );
  return a;
}


/**/ function stack_clear( s : Cell ){
/*c  void     stack_clear( Cell s )  { c*/
// Empty the entire stack, don't deallocate it however
  let ptr;
  let len;
  let ii;
  if( stack_is_extended( s ) ){
    ptr = value( s );
  }else{
    ptr = s;
  }
  len = value( s );
  for( ii ; ii < len ; ii++ ){
    clear( ptr + ( ii + 1 ) * ONE );
  };
  // Set length to 0
  de&&mand_cell_type( ptr, type_integer );
  set_value( ptr, 0 );
}


/**/ function stack_free( s : Cell ) : void {
/*c  void     stack_free( Cell s )          { c*/
// Free a stack
  // Clear all the cells in the stack
  stack_clear( s );
  if( stack_is_extended( s ) ){
    // Check that length is 0
    de&&mand_cell_type( value( s ), type_integer );
    de&&mand_eq( value( value( s ) ), 0 );
    reset( value( s ) );
    free_area( value( s ) );
  }else{
    de&&mand_cell_type( s, type_integer );
    de&&mand_eq( value( s ), 0 );
  }
  reset( s );
  free_area( s );
}


/**/ function stack_capacity( s : Cell ) : Length {
/*c  Length   stack_capacity( Cell s )            { c*/
// Return the capacity of a stack
  // The capacity does not include the first cell that holds the length itself
  if( stack_is_extended( s ) ){
    return area_size( value( s ) ) / size_of_cell - 1;
  }else{
    return area_size( s ) / size_of_cell - 1;
  }
}


/**/ function stack_length( s : Cell ) : Length {
/*c  Length   stack_length( Cell s )            { c*/
// Return the length of a stack, ie the number of attributes
  // This does not include the first cell that holds the length itself
  if( stack_is_extended( s ) ){
    return value( value( s ) );
  }else{
    return value( s );
  }
}


/**/ function stack_is_empty( s : Cell ) : boolean {
/*c  boolean  stack_is_empty( Cell s )            { c*/
// Return true if the stack is empty
  return stack_length( s ) == 0;
}


/**/ function stack_is_not_empty( s : Cell ) : boolean {
/*c  boolean  stack_is_not_empty( Cell s )            { c*/
// Return true if the stack is not empty
  return stack_length( s ) != 0;
}


/**/ function stack_set_length( s : Cell, l : Length ) : void {
/*c  void     stack_set_length( Cell s, Length l )            { c*/
// Set the length of a stack
  // ToDo: what about overflow?
  if( stack_is_extended( s ) ){
    set_value( value( s ), l );
  }else{
    set_value( s, l );
  }
}


/**/ function stack_push( s : Cell, c : Cell ) : void {
/*c  void     stack_push( Cell s, Cell c )            { c*/
// Push a cell on a stack, the source cell gets cleared
  const l = stack_length( s );
  stack_put( s, l, c );
  de&&mand_eq( stack_length( s ), l + 1 );
}


/**/ function stack_push_copy( s : Cell, c : Cell ) : void {
/*c  void     stack_push_copy( Cell s, Cell c )            { c*/
// Push a cell on a stack, the source cell is not cleared
  const l = stack_length( s );
  stack_put_copy( s, l, c );
  de&&mand_eq( stack_length( s ), l + 1 );
}


/**/ function stack_pop( s : Cell ) : Cell {
/*c  Cell     stack_pop( Cell s )          { c*/
// Pop a cell from a stack, just returning it's address
  const l = stack_length( s );
  if( check_de && l < 1 ){
    FATAL( "stack_pop: stack is empty" );
  }
  stack_set_length( s, l - 1 );
  return stack_at( s, l - 1 );
}


/**/ function stack_pop_nice( s : Cell ) : Cell {
/*c  Cell     stack_pop( Cell s )          { c*/
// Pop a cell from a stack, just returning it's address, 0 if empty
const l = stack_length( s );
if( check_de && l < 1 ){
  return 0;
}
stack_set_length( s, l - 1 );
return stack_at( s, l - 1 );
}


/**/ function stack_peek( s : Cell ) : Cell {
/*c  Cell     stack_peek( Cell s )          { c*/
// Peek at the top of a stack, ie the last cell
  let ptr;
  if( stack_is_extended( s ) ){
    ptr = value( s );
  }else{
    ptr = s;
  }
  return ptr + value( ptr );
}


/**/ function stack_dup( s : Cell ) : Cell {
/*c  Cell     stack_dup( Cell s )          { c*/
// Duplicate the top of a stack
  const c = stack_peek( s );
  stack_push_copy( s, c );
  return c;
}


/**/ function stack_at( s : Cell, i : Index ) : Cell {
/*c  Cell     stack_get( Cell s, Index i )            { c*/
// Get the i-th cell from a stack
  let addr;
  // ToDo: handle negative indices?
  // Must be length 1 to hold item 0, hence the + 1
  stack_extend( s, i + 1 );
  if( stack_is_extended( s ) ){
    addr = value( s ) + ( i + 1 ) * ONE
  }else{
    addr = s + ( i + 1 ) * ONE;
  }
  return addr;
}


/**/ function stack_put( s : Cell, i : Index, c : Cell ) : void {
/*c  void     stack_put( Cell s, Index i, Cell c )              { c*/
// Set the i-th cell from a stack, the source cell gets cleared
  move_cell( c, stack_at( s, i ) );
}


/**/ function stack_put_copy( s : Cell, i : Index, c : Cell ) : void {
/*c  void     stack_put_copy( Cell s, Index i, Cell c )              { c*/
// Set the i-th cell from a stack, the source cell is not cleared
  copy_cell( c, stack_at( s, i ) );
}


/**/ function stack_dump( s : Cell ) : string {
/*c  std::string stack_dump( Cell s )         { c*/
// Dump a stack
  // "[ ]" is the empty stack
  const l = stack_length( s );
  /**/ let r = "";
  /*c std::string r( "" ); */
  // ToDo: a JSON style format, TLV probably
  r += "[ ";
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    r += dump( stack_at( s, ii ) ) + " ";
  }
  r += "]";
  return r;
}


/**/ function stack_lookup( s : Cell, name : string ) : Cell {
/*c Cell      stack_lookup( Cell s,   std::string& name )           { c*/
// Lookup a cell in a stack by name
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii = l;
  while( ii-- ){
    const c = stack_at( s, ii );
    if( teq( name, symbol_to_text( c ) ) ){
      return c;
    }
  }
  // If the attribute is not found, void is returned
  return 0;
}


/**/ function stack_lookup_by_tag( s : Cell, tag : Tag ) : Cell {
/*c  Cell     stack_lookup_by_tag( Cell s,   Tag tag   )        { c*/
// Lookup a cell in a stack by tag
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii = l;
  while( ii-- ){
    const c = stack_at( s, ii );
    if( tag == name( c ) ){
      return c;
    }
  }
  // If the attribute is not found, void is returned
  return 0;
}


/**/ function stack_update_by_text_name( s : Cell, n : string ) : void {
/*c void      stack_update_by_text_name( Cell s,   std::string& n )           { c*/
// Update a cell using the tos cell, by name.
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii = l;
  while( ii-- ){
    const c = stack_at( s, ii );
    if( teq( n, symbol_to_text( c ) ) ){
      stack_put( s, ii, stack_peek( s ) );
      stack_pop( s );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_text_name, attribute not found,"
    + n
  );
}


/**/ function stack_update_by_value( s : Cell, c : Cell ) : void {
/*c void      stack_update_by_value( Cell s,   Cell c )          { c*/
// Update a cell using the tos cell, by value
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii = l;
  while( ii-- ){
    const a = stack_at( s, ii );
    if( a == c ){
      stack_put( s, ii, stack_peek( s ) );
      stack_pop( s );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_value, attribute not found,"
    + N( c)
  );
}


/**/ function stack_update_by_tag( s : Cell, tag : Tag ) : void {
/*c void      stack_update_by_tag( Cell s,   Tag tag )          { c*/
// Update a cell using the tos cell, by tag
  const l = stack_length( s );
  // Starting from the end of the stack, look for the name
  let ii = l;
  while( ii-- ){
    const c = stack_at( s, ii );
    if( tag == name( c ) ){
      stack_put( s, ii, stack_peek( s ) );
      stack_pop( s );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_tag, attribute not found, "
    + tag_to_text( tag )
  );
}


/**/ function stack_contains_cell( s : Cell, c : Cell ) : boolean {
/*c boolean   stack_contains_cell( Cell s,   Cell c )             { c*/
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


/**/ function stack_contains_name( s : Cell, name : string ) : boolean {
/*c  boolean  stack_contains_name( Cell s,   std::string name )              { c*/
// Check if a stack contains a cell by name
  const l = stack_length( s );
  let ii;
  for( ii = 0 ; ii < l ; ii++ ){
    const c = stack_at( s, ii );
    if( name == symbol_to_text( c ) ){
      return true;
    }
  }
  return false;
}


/**/ function stack_contains_tag( s : Cell, tag : Tag ) : boolean {
/*c  boolean  stack_contains_tag( Cell s,   Tag tag )             { c*/
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


/**/ function stack_resize( s : Cell, l : Length ) : Cell {
/*c  Cell     stack_resize( Cell s,   Length l )          { c*/
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


/**/ function stack_rebase( s : Cell ){
/*c  void     stack_rebase( Cell s )  { c*/
// Return a fixed size copy of a stack, clear the old stack
  return stack_resize( s, stack_length( s ) );
}


/**/ function stack_is_extended( s : Cell ) : boolean {
/*c  boolean  stack_is_extended() { c*/
// Check if a stack is extended, ie extensible
  return type( s ) == type_reference;
}


/**/ function stack_extend( s : Cell, l : Length ) : void {
/*c  void     stack_extend( Cell s,   Length l )          { c*/
// Extend a stack with a new capacity if needed, clear the old stack
  if( l <= stack_capacity( s ) ){
    if( l > stack_length( s ) ){
      stack_set_length( s, l );
    }
    return;
  }
  if( ! stack_is_extended( s ) ){
    FATAL( "Can't extend a non extended stack" );
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
/*c   #define boolean_false   0  c*/

/**/  const boolean_true    = 1;
/*c   #define boolean_true    1    c*/


/**/ function set_boolean_cell( c : Cell, v : Value ){
/*c  void     set_boolean_cell( Cell c, Value v ) {   c*/
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

/**/ function tag( tag : text ) : Tag {
/*c  Tag      tag( std::string tag ) {  c*/
// Get the singleton cell for a tag, make it on fly if needed
  return register_symbol( tag );
}


/**/ function tag_exists( n : text ) : boolean {
/*c  bool     tag_exists( std::string n ) {  c*/
// Return true if the tag singleton cell with the given name exists
  return is_valid_tag( symbol_lookup( n ) );
}


/**/ function is_valid_tag( id : Tag ) : boolean {
/*c  bool     is_valid_tag( Tag id ) {  c*/
// True if tag was internalized
  // <= vs < because register_symbol() calls this function before incrementing
  return id >= 0 && id <= all_symbol_cells_length;
}


/**/ function set_tag_cell( c : Cell, n : Tag ){
/*c  void     set_tag_cell( Cell c, Tag n ){  c*/
  set( c, type_tag, n, n );
  // copy_cell( tag_singleton_cell_by_id( n ), c );
}


/**/ const   the_void_cell = 0; // tag_singleton_cell_by_name( "void" );
/*c  #define the_void_cell   0   c*/
/**/ de&&mand_eq( the_void_cell, 0 );


/*c{
  int init_void( void ){
  set_type( the_void_cell, type_void );
  return 0;
}
const dummy_init_void = init_void();
}*/


/* -----------------------------------------------------------------------
 *  Integer, type 3, 32 bits
 *  ToDo: Double integers, 64 bits.
 *  ToDo: type_f64, type_bigint, type_f32
 */

/**/ function set_integer_cell( c : Cell, v : Value ){
/*c  void     set_integer_cell( Cell c, Value v ){  c*/
  set( c, type_integer, tag_integer, v );
}


/**/ function is_an_integer_cell( c : Cell ) : boolean {
/*c  boolean  is_an_integer_cell( Cell c ){  c*/
  return type( c ) == type_integer;
}


/**/ function cell_integer( c : Cell ) : Value {
/*c  Value    cell_integer( Cell c ){  c*/
  de&&mand_eq( type( c ), type_integer );
  return value( c );
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

// Linked list of free byte areas, initialy empty, malloc/free related
let the_free_area = 0;

/**/ function area_header( area : Cell ) : Cell {
/*c  Cell     area_header( Cell area ) {  c*/
  // Return the address of the first header cell of a byte area, the ref count.
  return area - 2 * ONE;
}

/**/ function header_to_area( header : Cell ) : Cell {
/*c  Cell     header_to_area( Cell header ) {  c*/
  // Return the address of an area given the address of it's first header cell.
  return header + 2 * ONE;
}


/**/ function area_ref_count( area : Cell ) : Value {
/*c  Value    area_ref_count( Cell area ) {  c*/
// Return the reference counter of a byte area
  alloc_de&&mand( is_busy_area( area ) );
  return value( area_header( area ) );
}


/**/ function set_area_busy( area : Cell ) : void {
/*c  void     set_area_busy( Cell area ) {  c*/
// Set the tag of the header of a byte area to tag_dynamic_ref_count
  set_name( area_header( area ), tag_dynamic_ref_count );
}


/**/ function set_area_free( area : Cell ) : void {
/*c  void     set_area_free( Cell area ) {  c*/
  // Set the tag of the header of a byte area to tag_dynamic_next_area
  set_name( area_header( area ), tag_dynamic_next_area );
}


/**/ function is_busy_area( area : Cell ) : boolean {
/*c  bool     is_busy_area( Cell area ) {  c*/
  // Return true if the area is busy, false if it is free
  return name( area_header( area ) ) == tag_dynamic_ref_count;
}


/**/ function is_free_area( area : Cell ) : boolean {
/*c  bool     is_free_area( Cell area ) {  c*/
  // Return true if the area is free, false if it is busy
  return name( area_header( area ) ) == tag_dynamic_next_area;
}


/**/ function is_dynamic_area( area : Cell ) : boolean {
/*c  bool     is_dynamic_area( Cell area ) {  c*/
  // Return true if the area is a dynamic area, false otherwise
  // This is maybe not 100% reliable, but it is good enough.
  const first_header_ok  = is_busy_area( area ) || is_free_area( area );
  if( ! first_header_ok )return false;
  const second_header_ok
  = name( area_header( area ) + ONE ) == tag_dynamic_area_size;
  return second_header_ok;
}


/**/ function free_if_area( area : Cell ) : void {
/*c  void     free_if_area( Cell area ) {  c*/
  // Unlock the area if it is a dynamic area
  if( is_dynamic_area( area ) ){
    free_area( area );
  }
}


/**/ function next_area( area : Cell ) : Cell {
/*c  Cell     next_area( Cell area ) {  c*/
  // Return the address of the next free area
  alloc_de&&mand( is_free_area( area ) );
  return value( area_header( area ) );
}


/**/ function set_next_area( area : Cell, nxt : Cell ) : void {
/*c  void     set_next_area( Cell area, Cell nxt ) {  c*/
  // Set the address of the next free area
  alloc_de&&mand( is_free_area( area ) );
  set_value( area_header( area ), nxt );
}


/**/ function set_area_ref_count( area : Cell, v : Value ) : void {
/*c  void     set_area_ref_count( Cell area, Value v ) {  c*/
  // Set the reference counter of a byte area
  alloc_de&&mand( is_busy_area( area ) );
  set_value( area_header( area ), v );
}


/**/ function area_size( area : Cell ) : Size {
/*c  Size area_size( Cell area ) {  c*/
// Return the size of a byte area, in bytes
  return value( area_header( area ) + offset_of_area_size );
}


/**/ function set_area_size( area : Cell, s : Size ) : void {
/*c  void     set_area_size( Cell area, Size s ) {  c*/
  // Set the size of a byte area
  set_value( area_header( area ) + offset_of_area_size, s );
}


/**/ function set_area_size_tag( area : Cell ) : void {
/*c  void     set_area_size_tag( Cell area ) {  c*/
  // Set the tag of the second header of a byte area to tag_dynamic_area_size
  // The second header is after the first one, ie after the ref count.
  set_name(
    area_header( area ) + offset_of_area_size,
    tag_dynamic_area_size
  );
}


/**/ function adjusted_bytes_size( s : Size ) : Size {
/*c  Size adjusted_bytes_size( Size s ) {  c*/
  // Align on size of cells and add size for heap management
  // The header is two cells, first is the ref count, second is the size.
  let aligned_size = 2 * size_of_cell
  + ( s + ( size_of_cell - 1 ) ) & ~( size_of_cell - 1 );
  // + ( s         + ( size_of_cell - 1 ) )
  //   & ( 0xffffffff - ( size_of_cell - 1 )
  // );
  return aligned_size;
}


// All budy lists are empty at first, index is number of cells in area
/**/  const all_free_lists_by_area_length : Array< Cell >
/**/  = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
/*c
u32 all_free_lists_by_area_length[ 10 ]
= { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
c*/


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

/**/ function area_free_small_areas() : boolean {
/*c  bool     area_free_small_areas() {  c*/
// Free all small areas, ie all areas of size 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  something_was_collected = false;
  let ii;
  for( ii = 0 ; ii < 10 ; ii++ ){
    let free;
    while( ( free = all_free_lists_by_area_length[ ii ] ) != 0 ){
      all_free_lists_by_area_length[ ii ] = next_area( free );
      set_next_area( free, the_free_area );
      the_free_area = free;
      de&&mand( is_free_area( free ) );
      something_was_collected = true;
    }
  }
  return something_was_collected;
}


/**/ function area_garbage_collector() : boolean {
/*c  bool     area_garbage_collector() {  c*/
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
  let count_visited = 0;

  while( true ){

    // Exit loop if too much time has been spent, unless nothing was collected
    if( count_visited > collector_increment && something_was_collected )break;

    // Time is proportional to the number of cells visited
    count_visited++;

    // We're not supposed to visit cells after the last cell
    if( count_visited > the_next_free_cell ){
      return false;
    }

    // OK, advance to next cell. Note: cell 0 is never visited, that's ok
    cell += ONE;

    // Time to restart if last cell was reached
    if( cell >= the_next_free_cell ){
      cell = 0;
      continue;
    }

    // If something looks like two consecutive free areas, maybe coalesce them
    if( !is_free_area( cell ) )continue;

    // Coalesce consecutive free areas, as long as there are some
    while( true ){

      const potential_next_area = cell + area_size( cell );

      if( potential_next_area >= the_next_free_cell
      || !is_free_area( potential_next_area )
      || !is_dynamic_area(  cell )
      || !is_dynamic_area(  potential_next_area )
      )break;

      // Coalesce consecutive two free areas
      debugger;
      let total_size = area_size( cell ) + area_size( potential_next_area );
      set_area_size( cell, total_size );
      set_next_area( cell, next_area( potential_next_area ) );
      reset( area_header( potential_next_area ) );
      reset( area_header( potential_next_area ) + ONE );
      something_was_collected = true;

    } // End of while( true ) over consecutive free areas

  } // End of while( true ) over all cells

  return something_was_collected;

}


/**/ function area_garbage_collector_all() : void {
/*c  void     area_garbage_collector_all(){  c*/
// Run garbage collector until nothing is collected
  // Start from the beginning and loop until nothing is collected
  last_visited_cell = 0;
  while( area_garbage_collector() );
}


/**/ function allocate_area( s : Size ) : Cell {
/*c  Cell     allocate_area( Size s ){  c*/
  // Allocate a byte area, return its address, or 0 if not enough memory

  /*de*/ if( de ){
  /*de*/   if( s > 1000 ){
  /*de*/     if( s != 4096 ){
  /*de*/       bug( S()+ "Large memory allocation, " + N( s ) );
  /*de*/       debugger;
  /*de*/     }
  /*de*/   }
  /*de*/   // alloc_de&&mand( size != 0 );
  /*de*/ }

  // Align on 64 bits, size of a cell, plus size of headers
  let adjusted_size = adjusted_bytes_size( s );

  // Search in "per length" free lists if size is small enough
  if( adjusted_size <= 10 * size_of_cell ){
    let try_length = adjusted_size / size_of_cell;
    while( true ){
      let buddy_free_area
      = all_free_lists_by_area_length[ try_length ];
      if( buddy_free_area ){
        all_free_lists_by_area_length[ try_length ]
        = next_area( buddy_free_area );
        set_area_busy(      buddy_free_area );
        set_area_ref_count( buddy_free_area, 1 );
        set_area_size(      buddy_free_area, try_length * size_of_cell );
        return buddy_free_area;
      }else{
        // Try with a bigger area
        try_length++;
        if( try_length > 10 )break;
      }
    }
  }

  // ToDo: search for free area

  // Starting from the first item of the free area list
  let area = the_free_area;
  let previous_area = 0;
  if( alloc_de && area ){
    alloc_de&&mand( is_safe_area( area ) );
    alloc_de&&mand( is_free_area( area ) );
  }
  while( area ){
    alloc_de&&mand( is_safe_area( area ) );
    alloc_de&&mand( is_free_area( area ) );
    const area_sz = area_size( area );
    if( area_sz < adjusted_size ){
      previous_area = area;
      area = next_area( area );
      continue;
    }
    // The area is big enough, use it
    // Break big area and release extra space
    let remaining_size = area_sz - adjusted_size;
    // Only split if the remaining area is big enough for headers
    if( remaining_size >= 2 * size_of_cell ){
      let remaining_area = area + ( adjusted_size / size_of_cell );
      set_area_size_tag( remaining_area );
      set_area_size(     remaining_area, remaining_size );
      set_area_free(     remaining_area );
      set_next_area(     remaining_area, next_area( area ) );
      if( previous_area ){
        set_next_area( previous_area, remaining_area );
      }else{
        the_free_area = remaining_area;
      }
      alloc_de&&mand( is_safe_area( remaining_area ) );
      alloc_de&&mand( is_free_area( remaining_area ) );
    }else{
      // The area is too small to split, use it all
      adjusted_size = area_sz;
      if( previous_area ){
        set_next_area( previous_area, next_area( area ) );
      }else{
        the_free_area = next_area( area );
      }
    }
    break;
  }

  // If nothing was found, allocate more memory for the heap and retry
  if( ! area ){
    // It' a good time to free whatever was accumulated in small areas
    // ToDo: check limit, ie out of memory
    area = the_next_free_cell + ONE + 2 * ONE;
    // This is like sbrk() in C, hence allocate some spare room
    adjusted_size += 4 * 1024;
    the_next_free_cell += adjusted_size / size_of_cell;
    // Pretend it is a busy area and then free it to add it to the heap
    set_area_busy(      area );
    set_area_ref_count( area, 1 );
    set_area_size_tag(  area );
    set_area_size(      area, adjusted_size );
    free_area(          area );
    return allocate_area( s );
  }

  // Area is locked initialy, once, see lock_bytes()
  set_area_busy(      area );
  set_area_ref_count( area, 1 );

  // Remember size of area, this does include the header overhead
  set_area_size_tag( area );
  set_area_size(     area, adjusted_size );

  // Return an address that is after the header, at the start of the payload
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  alloc_de&&mand( is_last_reference_to_area( area) );
  alloc_de&&mand_neq( area, the_free_area );
  return area;

}


/**/ function resize_area( a : Cell, s : Size ) : Cell {
 /*c     Cell resize_area( Cell a,   Size s   )        {  c*/
  de&&mand( is_safe_area( a ) );
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


/**/ function free_area( area : Cell ){
/*c  void     free_area( Cell area ){  c*/
  // ToDo: add to pool for malloc()
  // ToDo: a simple solution is to split the array into cells
  // and call free_cell() for each of them. That's easy.
  // Another solution is to keep lists of free zones of
  // frequent sizes.
  // Other malloc/free style solution would not be much more complex.
  if( area == 0 ){
    // Assume it's about the empty text, ""
    debugger;
    return;
  }
  alloc_de&&mand( is_safe_area( area ) );
  const old_count = area_ref_count( area );
  // Free now if not locked
  if( old_count == 1 ){

    const size = area_size( area );

    // The whole area should be full of zeros, ie cleared
    /*de*/ if( de ){
    /*de*/   // The size includes the header overhead, currently 2 cells
    /*de*/   let ncells = size / size_of_cell - 2;
    /*de*/   let ii;
    /*de*/   for( ii = 0 ; ii < ncells ; ii += ONE ){
    /*de*/    mand_eq( value( area + ii ), 0 );
    /*de*/     mand_eq( info(  area + ii ), 0 );
    /*de*/   }
    /*de*/ }

    // Add to a "per length" free list if small enough area
    if( size <= 10 * size_of_cell ){
      set_area_free( area );
      set_next_area( area, all_free_lists_by_area_length[ size / size_of_cell ] );
      all_free_lists_by_area_length[ size / size_of_cell ] = area;
      // ToDo: this can degenerate when too many small areas are unused.
      // I should from time to time empty the free lists and add areas to the
      // global pool, the older areas first to maximize locality.
      return;
    }

    // Add area in free list, at the end to avoid premature reallocation
    // ToDo: insert area in sorted list instead of at the start?
    // I should do this to coalesce adjacent free areas to avoid fragmentation
    set_area_free( area );
    set_next_area( area, the_free_area );
    the_free_area = area;
    alloc_de&&mand( is_safe_area( area ) );
    alloc_de&&mand( is_free_area( area ) );
    return;
  }
  // Decrement reference counter
  const new_count = old_count - 1;
  set_area_ref_count( area, new_count );
}


/**/ function lock_area( area : Cell ) : void {
/*c  void     lock_area( Cell area ){  c*/
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


/**/ function is_last_reference_to_area( area : Cell ) : boolean {
/*c boolean   is_last_reference_to_area( Cell area ){  c*/
  // When the last reference disappears the bytes must be freed.
// To be called by clear_cell() only, on non zero adresses.
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  return area_ref_count( area ) == 1;
}


const the_first_ever_area = the_next_free_cell;


/**/ function is_safe_area( area : Cell ) : boolean {
/*c  boolean  is_safe_area( Cell area ){  c*/
// Try to determine if the address points to a valid area allocated
// using allocates_area() and not already released.

  if( !alloc_de )return true;

  // This helps to debug unbalanced calls to lock_area() and free_area().
  // zero is ok for both reference counter & size because it never happens
  if( area == 0 ){
    return true;
  }

  // The address must be aligned on a cell boundary
  if( area % ( size_of_cell / size_of_word ) != 0 ){
    bug( S()+ "Invalid area, not aligned on a cell boundary, " + N( area ) );
    return false;
  }

  // The address must be in the heap
  if( area < the_first_ever_area ){
    bug( S()+ "Invalid area before the first cell, " + N( area ) );
    return false;
  }

  if( area - 2 * ONE >= the_next_free_cell ){
    bug( S()+ "Invalid area after the end, " + N( area ) );
  }

  if( is_busy_area( area ) ){

    // The reference counter must be non zero if busy
    const reference_counter = area_ref_count( area );
    if( reference_counter == 0 ){
      bug( S()
        + "Invalid reference counter for area, " + N( reference_counter )
        + " " + N( area )
      );
      return false;
    }

    // When one of the 4 most significant bits is set, that's a type id probably
    if( reference_counter >= ( 1 << 28 ) ){
      const type = unpack_type( reference_counter );
      bug( S()+ "Invalid counter for area? " + N( type ) + " " + N( area ) );
      return false;
    }

  }

  // The size must be bigger than the size of the headers
  const size = area_size( area );
  if( size <= 2 * ( size_of_cell / size_of_word ) ){
    bug( S()+ "Invalid size for area, " + N( size ) + " " + N( area ) );
    return false;
  }

  // When one of the 4 most significant bits is set, that's a type id probably
  if( size >= ( 1 << 29 ) ){
    const type = unpack_type( size );
    bug( S()+ "Invalid counter for area? " + N( type ) + " " + N( area ) );
    return false;
  }

  // The size must be a multiple of the size of a cell
  if( size % ( size_of_cell / size_of_word ) != 0 ){
    bug( S()+ "Invalid size for area " + N( size ) + " " + N( area ) );
    return false;
  }

  // The size must be smaller than the heap size
  if( size > ( the_next_free_cell - the_first_ever_area ) * size_of_cell ){
    bug( S()+ "Invalid size for area " + N( size ) + " " + N( area ) );
    return false;
  }

  return true;
}

/**/ function increment_object_ref_count( c : Cell ){
/*c  void     increment_object_ref_count( Cell c ){  c*/
  lock_area( c );
}


/**/ function decrement_object_ref_count( c : Cell ){
/*c  void     decrement_object_ref_count( Cell c ){  c*/
  free_area( c );
}


/*de*/ /**/ function area_test_suite(){
/*de*/   // This was generated by copilot, it is very insufficent
/*de*/   const the_area = allocate_area( 10 );
/*de*/   de&&mand( is_safe_area( the_area ) );
/*de*/   de&&mand( is_busy_area( the_area ) );
/*de*/   free_area( the_area );
/*de*/   de&&mand( is_free_area( the_area ) );
/*de*/   const the_area2 = allocate_area( 10 );
/*de*/   de&&mand( is_safe_area( the_area2 ) );
/*de*/  de&&mand( is_busy_area( the_area2 ) );
/*de*/   lock_area( the_area2 );
/*de*/   de&&mand( is_busy_area( the_area2 ) );
/*de*/   de&&mand( is_safe_area( the_area2 ) );
/*de*/   free_area( the_area2 );
/*de*/   de&&mand( is_safe_area( the_area2 ) );
/*de*/   de&&mand( is_busy_area( the_area2 ) );
/*de*/   free_area( the_area2 );
/*de*/   de&&mand( is_free_area( the_area ) );
/*de*/ }


/* -----------------------------------------------------------------------
 *  Reference, type 4, 32 bits to reference a dynamically allocated array
 *  of cells, aka a smart pointer to an Inox object.
 */

/**/ function set_reference_cell( c : Cell, v : Value ){
/*c  void     set_reference_cell( Cell c,  Value v   ){  c*/
  set( c, type_reference, tag_reference, v );
}


/**/ function cell_reference( c : Cell ) : Value {
/*c  Value    cell_reference( Cell c  )         {  c*/
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

/*!c{*/

// Access to proxied object is opaque, there is an indirection.
// Each object has an id which is a cell address. Cells that
// reference proxied object use that cell address as a pointer.
// Indirection table to get access to an object using it's id.
// The id is the address of a dynamically allocated cell that is
// freed when the reference counter reaches zero.
// When that happens, the object is also deleted from the map.
let all_proxied_objects_by_id = new Map< Cell, any >();


/**/ function make_proxy( object : any ) : Index {
/*c  Value    make_proxy( void* object )             {  c*/
  const proxy = allocate_area( 0 );
  all_proxied_objects_by_id.set( proxy, object );
  // de&&mand_eq( value( proxy ), 0 );
  // de&&mand_eq( info(  proxy ), 0 );
  // ToDo: cache an _inox_tag into the constructor to avoid call to tag()
  // const class_name = tag( object.constructor.name );
  // Proxy cell does not actually exists, only the id is used
  alloc_de&&mand( is_safe_area( proxy ) );
  alloc_de&&mand( is_busy_area( proxy ) );
  return proxy;
}


/**/ function set_proxy_cell( c : Cell, proxy : Index ){
/*c  void     set_proxy_cell( Cell c,  Value proxy       ){  c*/
  alloc_de&&mand( is_safe_area( proxy ) );
  set(
    c,
    type_proxy,
    /**/ tag( proxied_object_by_id( proxy ).constructor.name ),
    /*c  tag( "c_string" ),  c*/
    proxy
  );
}


/**/ function free_proxy( proxy : Cell ){
/*c  void     free_proxy( Cell proxy  ){  c*/
  // This is called by clear_cell() when reference counter reaches zero
  de&&mand_neq( proxy, the_empty_text_proxy );
  alloc_de&&mand( is_safe_area( proxy ) );
  alloc_de&&mand( is_busy_area( proxy ) );
  all_proxied_objects_by_id.delete( proxy );
  free_area( proxy );
}


/**/ function proxied_object_by_id( id : Cell ) : any {
/*c  void*    proxied_object_by_id( Value id  )       {  c*/
  alloc_de&&mand( is_safe_area( id ) );
  return all_proxied_objects_by_id.get( id );
}


/**/ function cell_proxy( c : Cell ) : Cell {
/*c  Value    cell_proxy( Cell c   )        {  c*/
  const proxy = value( c );
  alloc_de&&mand( is_safe_area( proxy ) );
  return proxy;
}


/**/ function cell_proxied_object( c : Cell ) : any {
 /*c void*    cell_proxied_object( Cell c   )       {  c*/
  const proxy = cell_proxy( c );
  alloc_de&&mand( is_safe_area( proxy ) );
  /**/ return proxied_object_by_id( proxy );
  /*c return (void*) proxy; c*/
}


/**/ function    proxy_to_text( c : Cell ) : text {
/*c  std::string proxy_to_text( Value c  )        {  c*/
  alloc_de&&mand( is_safe_area( c ) );
  // Some special case 0 produces the empty text.
  if( !c )return no_text;
  if( !all_proxied_objects_by_id.has( c ) ){
    /*de*/ if( de ){
    /*de*/   bug( "Attempt to convert a non proxy object to text" );
    /*de*/   debugger;
    /*de*/ }
    return "";
  }
  let obj = all_proxied_objects_by_id.get( c );
  return obj.toString ? obj.toString() : "";
}

// In C++ std::string is the only proxied object at this time
/*}{

Cell make_proxy( std::string& s ){
  if( s.empty()  )return (Cell) no_text.data();
  // This does not work if 64 bits addresses are used
  return (Cell) strdup( s.data() );
  // ToDo: when free?
}

void free_proxy( Cell c ){
  char* s = (char*) value( c );
  if( !s )return;
  if( !*s )return;
  free( s );
}

const tag_c_string = tag( "c_string" );

void set_proxy_cell( Cell c, Index proxy ){
  set( c, type_proxy, tag_c_string, proxy );
}

/*}*/


/* -----------------------------------------------------------------------
 *  Text, type 6
 *  Currently implemented in typescript using a proxy object, a string.
 *  C++ implementation uses strdup/free.
 */

/*!c{*/

function set_text_cell( c : Cell, txt : string ){
  if( tlen( txt ) == 0 ){
    copy_cell( the_empty_text_cell, c );
    return;
  }
  // ToDo: I could cache the proxy object to avoid creating a new one
  // using a map, const text_cache = new Map< text, proxy >();
  // If the text is already in the cache, increment the reference counter.
  const proxy = make_proxy( txt );
  set( c, type_text, tag_text, proxy );
  de&&mand( cell_looks_safe( c ) );
  de&&mand( teq( cell_to_text( c ), txt ) );
}

function free_text( oid : Index ){
  free_proxy( oid );
}

/*}{

void set_text_cell( Cell c, std::string& txt ){
  if( txt.empty() ){
    copy_cell( the_empty_text_cell, c );
    return;
  }
  char* copy = strdup( txt.data() );
  set( c, type_text, tag_text, (Index) copy );
}


void free_text( Index oid ){
  // It's a strdup() allocated memory area
  char* txt = (char*) oid;
  if( !txt )return;
  if( *txt == 0 )return;
  free( txt );
}


void free_proxy( Index oid ){
  free_text( oid );
}

}*/


/* -----------------------------------------------------------------------
 *  ToDo: a custom string implementation.
 *  This is to avoid using the native string implementation.
 *  It should handle UTF-8, UTF-16, UTF-32, etc.
 *  It should be able to handle strings of any length.
 *  It should be able to handle strings of u8, u16, u32, etc.
 *  It is actually more a buffer than a string.
 *  That's not needed initially, but it will be needed later.
 */


/* -----------------------------------------------------------------------
 *  ToDo: a custome map implementation.
 *  This is an optimisation to avoid the sequential search in the stacks.
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

const the_default_verb_type  = type_void;
const the_default_verb_name  = tag( "default" );
const the_default_verb_value = the_default_verb_name;


/**/ function init_default_verb_value() : Cell {
/*c  Cell     init_default_verb_value()        {  c*/
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


/**/ function init_default_verb_definition() : Cell {
/*c  Cell    init_default_verb_definition()         {  c*/
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


/**/ function find_definition( verb_tag : Tag ) : Cell {
/*c  Cell     find_definition( Tag verb_tag   )        {  c*/
// Find a verb definition in the dictionary
  // Lookup in symbol table
  const d = get_definition( verb_tag );
  if( d == 0 ){
    return the_default_verb_definition;
  }
  return d;
}


/**/ function verb_exists( n : text ) : boolean {
/*c  boolean  verb_exists( text n   )           {  c*/
// Check if a verb exists in the dictionary
  // Check tag existence first
  if( !tag_exists( n ) ){
    return false;
  }
  const verb_tag = tag( n );
  // Then check if the verb is defined
  const d = get_definition( verb_tag );
  return d != 0;
}


/**/ function find_definition_by_text_name( n : text ) : Cell {
/*c  Cell     find_definition_by_text_name( text n   )        {  c*/
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


/**/ function definition( id : Index  ) : Cell {
/*c  Cell     definition( Index id    )        {  c*/
// Given a verb, as a tag, return the address of its definition
  return find_definition( id );
}


/**/ function definition_by_text_name( n : text ) : Cell {
/*c  Cell     definition_by_text_name( text n   )        {  c*/
  if( !tag_exists( n ) ){
    return the_default_verb_definition;
  }
  return definition( tag( n ) );
}


/**/ function  definition_length( def : Cell ) : Index {
/*c  Index     definition_length( Cell def   )         {  c*/
  // The header with length & flags is right before the code
  const header = def - ONE;
  const length = value( header ) & verb_length_mask;
  /*de*/ if( de ){
  /*de*/   if( length > 100 ){
  /*de*/     bug( "Large definition" );
  /*de*/     debugger;
  /*de*/   }
  /*de*/ }
  return length;
}


/**/ function set_definition_length( def : Cell, length : Count ){
/*c  void     set_definition_length( Cell def,   Count length   ){  c*/
// Hack used only by the inox-global primitive to turn a constant into variable
  // The header with length & flags is right before the code
  const header = def - ONE;
  const flags  = value( header ) & verb_flags_mask;
  set_value( header, flags | length );
}


/* -----------------------------------------------------------------------
 *  class/method lookup
 */

// Typescript version
/*!c{*/

// ToDo: implement Map as an object
const all_definitions_by_hashcode = new Map< Value, Cell >();

function find_definition_by_hashcode( hashcode : Value ) : Cell {
// Find a method verb definition in the dictionary
  if( !all_definitions_by_hashcode.has( hashcode ) ){
    return 0;
  }
  return all_definitions_by_hashcode.get( hashcode );
}


function find_method( class_tag : Tag, method_tag : Tag ) : Cell {
// Find a method in the dictionary
  const hashcode = ( class_tag << 13 ) + method_tag;
  return find_definition_by_hashcode( hashcode );
}


function register_method( klass : Tag, method : Tag, def : Cell ){
// Register a method in the method dictionary
  const hashcode = ( klass << 13 ) + method;
  all_definitions_by_hashcode.set( hashcode, def );
}


function register_method_definition( verb_tag : Tag, def : Cell ){
// Define a verb
  // There is a header is the previous cell, for length & flags.
  // The definition is an array of verbs with literals, primitive ids and
  // verb ids, aka a block. See RUN() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the verb.

  // Register the verb in the global symbol table
  register_definition( verb_tag, def );

  // Detect cccc.mmmmm verbs, ie method verbs
  let fullname = tag_to_text( verb_tag );
  const dot_position = tidx( fullname, "." );
  if( dot_position > 0 ){
    const class_name  = tcut( fullname, dot_position );
    const method_name = tbut( fullname, dot_position + 1 );
    if( method_name != "" ){
      const class_tag  = tag( class_name );
      const method_tag = tag( method_name );
      register_method( class_tag, method_tag, def );
    }
  }
}

// C++ version
/*}{


void register_method_definition( Tag verb_tag, Cell def ){
  register_definition( verb_tag, def );
  char* fullname = tag_to_text( verb_tag ).data();
  // Split into class and method name
  char* dot_position = strchr( fullname, '.' );
  if( dot_position = 0 )return;
  char* class_name  = fullname;
  *dot_position = 0;
  char* method_name = dot_position + 1;
  std::string std_class_name( class_name );
  std::string std_method_name( method_name );
  Tag class_tag  = tag( std_class_name );
  Tag method_tag = tag( std_method_name );
  // ToDo: create a vtable for the class if necessary
  // Add method to that vtable if not there aldready
}


Cell find_method( Tag class_tag, Tag method_tag ){
  // ToDo: find the method in the vtable of the class
  std::string class_name  = tag_to_text( class_tag );
  std::string method_name = tag_to_text( method_tag );
  //char* fullname = (char*) malloc(
  //  strlen( class_name )
  //  + 1 // dot
  //  + strlen( method_name )
  //  + 1 // zero
  //);
  //strcpy( fullname, class_name );
  //strcat( fullname, "." );
  //strcat( fullname, method_name );
  std::string fullname = class_name + "." + method_name;
  // Very slow naive version looks up sequentially in the symbol table
  int ii;
  for( ii = 0; ii < all_symbol_cells_length ; ii++ ){
    // char* t = all_symbol_texts[ ii ];
    std::string t = all_symbol_texts[ ii ];
    if( teq( t, fullname ) ){
      // free( fullname );
      return all_definitions[ ii ];
    }
  }
  // free( fullname );
  return 0;
}

}*/


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
const verb_flags_mask     = 0xff00000; // Mask for all flags
const verb_length_mask    = 0x00fffff; // Mask for length
const max_block_length    =   0xfffff; // Max length of a block, 20 bits


/**/ function set_verb_flag( id : InoxWord, flag : Value ){
/*c  void     set_verb_flag( InoxWord id,   Value flag   ){  c*/
  const header = definition( id ) - ONE;
  set_value( header, ( value( header ) & verb_length_mask ) | flag );
}


/**/ function test_verb_flag( id : InoxWord, flag : Value ){
/*c  Value    test_verb_flag( InoxWord id,   Value flag   ){  c*/
  const header = definition( id ) - ONE;
  return ( value( header ) & flag ) == flag ? 1 : 0;
}


/**/ function set_verb_immediate_flag( id : Index ) : void {
/*c  void     set_verb_immediate_flag( Index id   )        {  c*/
  set_verb_flag( id, immediate_verb_flag );
}


/**/ function is_immediate_verb( id : Index ) : Value {
/*c  Value    is_immediate_verb( Index id   )         {  c*/
  return test_verb_flag( id, immediate_verb_flag );
}


/**/ function set_verb_hidden_flag( id : Index ) : void {
/*c  void     set_verb_hidden_flag( Index id   )        {  c*/
  set_verb_flag( id, hidden_verb_flag );
}


/**/ function is_hidden_verb( id : Index ) : Value {
/*c  Value    is_hidden_verb( Index id   )         {  c*/
   return test_verb_flag( id, hidden_verb_flag );
}


/**/ function set_verb_operator_flag( id : Index ) : void {
/*c  void     set_verb_operator_flag( Index id   )        {  c*/
  set_verb_flag( id, operator_verb_flag );
}


/**/ function is_operator_verb( id : Index ) : Value {
/*c  Value    is_operator_verb( Index id   )         {  c*/
  return test_verb_flag( id, operator_verb_flag );
}


/**/ function set_verb_block_flag( id : Index ) : void {
/*c  void     set_verb_block_flag( Index id   )        {  c*/
  set_verb_flag( id, block_verb_flag );
}


/**/ function is_an_inline_block_cell( c : Cell ) : Value {
/*c  Value    is_an_inline_block_cell( Cell c   )         {  c*/
  return test_verb_flag( name( c ), block_verb_flag );
}


/**/ function is_block_ip( ip : Cell ) : boolean {
/*c  boolean  is_block_ip( Cell ip   )           {  c*/
  de&&mand_cell_name( ip, tag_inox_block );
  return ( value( ip ) & block_verb_flag ) != 0;
}


/**/ function set_inline_verb_flag( id : Index ) : void {
/*c  void     set_inline_verb_flag( Index id   )        {  c*/
  set_verb_flag( id,  inline_verb_flag );
}


/**/ function is_inline_verb( id : Index ) : Value {
/*c  Value    is_inline_verb( Index id   )         {  c*/
  return test_verb_flag( id, inline_verb_flag );
}


/**/ function set_verb_primitive_flag( id : Index ){
/*c  void     set_verb_primitive_flag( Index id   ){  c*/
  set_verb_flag( id, primitive_verb_flag );
}


/**/ function is_primitive_verb( id : Index ) : Value {
/*c  Value    is_primitive_verb( Index id   )         {  c*/
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


de&&mand_eq( type_void,      0x0 );
de&&mand_eq( type_boolean,   0x1 );
de&&mand_eq( type_tag,       0x2 );
de&&mand_eq( type_integer,   0x3 );
de&&mand_eq( type_reference, 0x4 );
de&&mand_eq( type_proxy,     0x5 );
de&&mand_eq( type_text,      0x6 );
de&&mand_eq( type_verb,      0x7 );
de&&mand_eq( type_flow,      0x8 );
de&&mand_eq( type_list,      0x9 );
de&&mand_eq( type_invalid,   0xA );


/**/ const is_reference_type_array = [
/*c  bool is_reference_type_array[ 16 ] = {  c*/
  false, false, false, false,  // void, boolean, tag, integer
  true,  true,  true,          // reference, proxy, string
  false, false, false,         // flow, list, invalid
                false, false,  // filler
  false, false, false, false   // filler, total is 16 types
/**/ ];
/*c };  c*/


/**/ function is_a_reference_type( t : Index ) : boolean {
/*c  bool     is_a_reference_type( Type type   ){  c*/
  return is_reference_type_array[ t ];
}


/**/ function needs_clear( c : Cell ){
/*c  bool     needs_clear( Cell c   ){  c*/
  return is_a_reference_type( type( c ) );
}


/* ----------------------------------------------------------------------------
 *  Cell content access, checked, without or with clearing
 */

/**/ function mand_type( actual : Index, expected : Index ){
/*c  bool     mand_type( Type actual,    Type expected    ){  c*/
  if( actual == expected )return;
  /*c std::string msg( "" ); c*/
  /**/ let msg = "";
  /**/ msg += "Bad type, "    + actual   + "/" + type_to_text( actual   );
  /**/ msg += " vs expected " + expected + "/" + type_to_text( expected );
  bug( msg );
  mand_eq( actual, expected );
  return true;
}


/**/ function mand_name( actual : Index, expected : Index ){
/*c  bool     mand_name( Name actual,    Name expected    ){  c*/
  if( actual == expected )return;
  /*c std::string msg( "" ); c*/
  /**/ let msg = "";
  /**/ msg += "Bad name, "    + actual   + " /" + tag_to_text( actual   );
  /**/ msg += " vs expected " + expected + " /" + tag_to_text( expected );
  bug( msg );
  mand_eq( actual, expected );
  return true;
}


/**/ function mand_tag( c : Cell ){
/*c  bool     mand_tag( Cell c   ){  c*/
  mand_cell_type( c, type_tag );
  return true;
}


/**/ function mand_integer( c : Cell ) : boolean {
/*c  bool     mand_integer( Cell c   ){  c*/
  mand_cell_type( c, type_integer );
  return true;
}


/**/ function mand_boolean( c : Cell ) : boolean {
/*c  bool     mand_boolean( Cell c   ){  c*/
  mand_cell_type( c, type_boolean );
  return false;
}


/**/ function mand_verb( c : Cell ) : boolean {
/*c  bool     mand_verb( Cell c   ){  c*/
// Check that the cell is a verb
  mand_cell_type( c, type_verb );
  return true;
}


/**/ function mand_block( c : Cell ){
/*c  bool     mand_block( Cell c ){  c*/
// ToDo: should there be a block type? or is verb ok?
  mand_cell_type( c, type_integer );
  // The value should point to a block
  const block = value( c );
  // Block have an header that is the block's length & flags
  mand_cell_type( block - ONE, type_integer );
  return true;
}


/**/ function mand_cell_type( c : Cell, type_id : Index ){
/*c  bool     mand_cell_type( Cell c,   Type type_id    ){  c*/
// Assert that the type of a cell is the expected type.
  const actual_type = type( c );
  if( actual_type == type_id )return;
  /*c std::string msg( "" ); c*/
  /**/ let msg = "";
  /**/ msg += "Bad type for cell " + c;
  /**/ msg += ", expected " + type_id     + "/" + type_to_text( type_id );
  /**/ msg += " vs actual " + actual_type + "/" + type_to_text( actual_type );
  bug( msg );
  // ToDo: should raise a type error
  mand_type( type( c ), type_id );
  return true;
}


/**/ function mand_cell_name( c : Cell, n : Tag ){
/*c  bool     mand_cell_name( Cell c,   Name n  ){  c*/
// Assert that the type of a cell is the expected type.
  const actual_name = name( c );
  if( actual_name == n )return;
  /*c std::string msg( "" ); c*/
  /**/ let msg = "";
  /**/ msg += "Bad name for cell " + c;
  /**/ msg += ", expected " + n           + " /" + tag_to_text( n );
  /**/ msg += " vs actual " + actual_name + " /" + tag_to_text( actual_name );
  bug( msg );
  // ToDo: should raise a type error
  mand_name( name( c ), n );
  return true;
}


/**/ function mand_void_cell( c : Cell ){
/*c  bool     mand_void_cell( Cell c   ){  c*/
// Assert that the type of a cell is the integer type.
  mand_cell_type( c, type_void );
  return true;
}


/**/ function mand_boolean_cell( c : Cell ){
/*c  bool     mand_boolean_cell( Cell c   ){  c*/
// Assert that the type of a cell is the boolean type.
  mand_cell_type( c, type_boolean );
  return true;
}


/**/ function mand_tag_cell( cell  : Cell ){
/*c  bool     mand_tag_cell( Cell cell    ){  c*/
// Assert that the type of a cell is the tag type.
  mand_cell_type( cell, type_tag );
  return true;
}


/**/ function mand_reference_cell( c : Cell ){
/*c  bool     mand_reference_cell( Cell c   ){  c*/
// Assert that the type of a cell is the integer type.
  mand_cell_type( c, type_reference );
  return true;
}


/**/ function mand_proxy_cell( c : Cell ){
/*c  bool     mand_proxy_cell( Cell c   ){  c*/
// Assert that the type of a cell is the integer type.
  mand_cell_type( c, type_proxy );
  return true;
}


/**/ function mand_text_cell( cell : Cell ){
/*c  bool     mand_text_cell( Cell cell   ){  c*/
// Assert that the type of a cell is the text type.
  mand_cell_type( cell, type_text );
  return true;
}


/**/ function mand_verb_cell( c : Cell ){
/*c  bool     mand_verb_cell( Cell c   ){  c*/
// Assert that the type of a cell is the integer type.
  mand_cell_type( c, type_verb );
  return true;
}


/**/ function  eat_raw_value( c : Cell ) : Index {
/*c  Index     eat_raw_value( Cell c   )         {  c*/
  // Like value() but also clear the cell, assuming it is not a reference
  const v = value( c );
  reset( c );
  return v;
}


/**/ function  get_tag( c : Cell ) : Index {
/*c  Index     get_tag( Cell c   )         {  c*/
  // Like value() but check that the cell is a tag
  check_de&&mand_tag_cell( c );
  return value( c );
}

/**/ function  get_integer( c : Cell ) : Index {
/*c  Index     get_integer( Cell c   )         {  c*/
  // Like value() but check that the cell is an integer
  check_de&&mand_integer( c );
  return value( c );
}


/**/ function  eat_tag( c : Cell ) : Tag {
/*c  Tag     eat_tag( Cell c   )         {   c*/
// Like eat_raw_value() but check that the cell is a tag
  check_de&&mand_tag( c );
  return eat_raw_value( c );
}


/**/ function  eat_integer( c : Cell ) : Index {
/*c  Index     eat_integer( Cell c   )         {  c*/
  // Like eat_raw_value() but check that the cell is an integer
  check_de&&mand_integer( c );
  return eat_raw_value( c );
}


/**/ function  eat_boolean( c : Cell ) : Index {
/*c  Index     eat_boolean( Cell c   )         {  c*/
  // Like eat_raw_value() but check that the cell is a boolean
  check_de&&mand_boolean( c );
  return eat_raw_value( c );
}


/**/ function  eat_value( c : Cell ) : Index {
/*c  Index     eat_value( Cell c   )         {  c*/
  // Like value() but also clear the cell
  const v = value( c );
  clear( c );
  return v;
}


// Foward declaration to please C++
/*c Cell POP( void ); c*/


/**/ function  pop_raw_value() : Value {
/*c  Value     pop_raw_value()         {  c*/
  // Like eat_raw_value() but pop the cell from the stack
  return eat_raw_value( POP() );
}


/**/ function  pop_value() : Value {
/*c  Value     pop_value()         {  c*/
  // Like eat_value() but pop the cell from the stack
  return eat_value( POP() );
}


/**/ function  pop_block() : Cell {
/*c  Cell      pop_block()        {  c*/
// Pop a block from the stack
  check_de&&mand_block( TOS );
  return pop_raw_value();
}


/**/ function  pop_tag() : Tag {
/*c  Tag       pop_tag()         {  c*/
// Pop a tag from the stack
  check_de&&mand_tag( TOS );
  return pop_raw_value();
}


/**/ function  pop_integer() : Value {
/*c  Value     pop_integer()         {  c*/
  // Pop an integer from the stack
  check_de&&mand_integer( TOS );
  return pop_raw_value();
}


/**/ function  pop_boolean() : Index {
/*c  Index     pop_boolean()         {  c*/
  check_de&&mand_boolean( TOS );
  return pop_raw_value();
}


/**/ function pop_verb() : Tag {
/*c  Tag      pop_verb()       {  c*/
  check_de&&mand_verb( TOS );
  return pop_raw_value();
}


/**/ function  get_boolean( c : Cell ) : Index {
/*c  Index     get_boolean( Cell c   )         {  c*/
  // Like value() but check that the cell is a boolean
  check_de&&mand_boolean( c );
  return value( c );
}


/**/ function mand_reference( c : Cell ) : boolean {
/*c  bool     mand_reference( Cell c   )        {  c*/
  // Check that the cell is a reference
  check_de&&mand( is_a_reference_cell( c ) );
  return true;
}


/**/ function  pop_reference() : Cell {
/*c  Cell      pop_reference()        {  c*/
  check_de&&mand_reference( TOS );
  return pop_raw_value();
}


/**/ function  eat_reference( c : Cell ) : Cell {
/*c  Cell      eat_reference( Cell c   )        {  c*/
  // Like eat_value() but check that the cell is a reference
  check_de&&mand_reference( c );
  return eat_value( c );
}


/**/ function  get_reference( c : Cell ) : Cell {
/*c  Cell      get_reference( Cell c   )        {  c*/
  // Like value() but check that the cell is a reference
  check_de&&mand_reference( c );
  return value( c );
}


/*!c{*/

function pop_as_text() : text {
// Pop a cell from the data stack and return it's text representation
  const cell = POP();
  const text = cell_to_text( cell );
  clear( cell );
  return text;
}

/*}{

std::string pop_as_text( void ){
// Caller is expected to call free() on the returned string
  Cell cell = POP();
  std::string t = cell_to_text( cell );
  clear( cell );
  return t;
}

}*/


/* ----------------------------------------------------------------------------
 *  Helpers to push values on the stack
 */

/**/ function push_text( t : text ){
/*c  void     push_text( std::string t   ){  c*/
PUSH();
set_text_cell( TOS, t );
}


/**/ function push_tag( t : Tag ){
/*c  void     push_tag( Tag t ){  c*/
PUSH();
set_tag_cell( TOS, t );
}


/**/ function push_integer( i : Index ){
/*c  void     push_integer( i32 i     ){  c*/
PUSH();
set_integer_cell( TOS, i );
}


/**/ function push_boolean( b : boolean ){
/*c  void     push_boolean( bool b      ){  c*/
PUSH();
set_boolean_cell( TOS, b ? 1 : 0 );
}


/**/ function push_true(){
/*c  void     push_true(){  c*/
push_boolean( true );
}


/**/ function push_false(){
/*c  void     push_false(){  c*/
push_boolean( false );
}


/**/ function push_proxy( proxy : Index ){
/*c  void     push_proxy( Index proxy ){  c*/
set_proxy_cell( PUSH(), proxy );
}


/* -----------------------------------------------------------------------------
 *  Some global cells
 */

const the_empty_text_proxy = make_proxy( no_text );
const tag_the_empty_text = tag( "the-empty-text" );
const the_empty_text_cell = allocate_cell();

/**/ function init_the_empty_text_cell(){
/*c  int init_the_empty_text_cell( void ){ c*/
  set(
    the_empty_text_cell,
    type_text,
    tag_the_empty_text,
    the_empty_text_proxy
  );
  // It's only now that testing the area allocator is possible.
  /**/ area_test_suite();
  /*c return 0; c*/
}

/*c int dummy_init_the_empty_text_cell = c*/
init_the_empty_text_cell();


/*!c{*/

/**/ function memory_dump() : Count {
/*c  int      memory_dump()             {   c*/
  // First, let's collect all garbage.
  area_garbage_collector_all();
  // Then let's dump each cell.
  let count = 0;
  let delta_void = 0;
  let count_voids = 0;
  let last = 0;
  let i;
  let v;
  const limit = the_next_free_cell;
  for( i = 0 ; i <= limit ; i += 2 ){
    v = mem32[ i ];

    // Dump 64 bits at a time, ie skip odd words.
    if( ( i & 0x1 ) != 0 ) return;

    // I would prefer a mem64 but it's not available.
    const c = i >> 1; // ToDo: change that if size of word changes

    // Skip void cells.
    if( v == 0 && info( c ) == 0 ) return;

    // Non void after the_last_cell is problematic...
    if( c >= the_next_free_cell ){
      console.log( "Warning: " + c + " >= the_last_cell" );
    }

    // Trace about consecutive skipped void cells
    if( c != last + ONE ){
      delta_void = ( c - last ) / ONE - 1;
      // On void could be the last cell of a definition
      if( delta_void > 1 ){
        // Count voids that for sure are not the last cell of a definition
        // There is an exception, see the hack in make-constant
        count_voids += delta_void - 1;
        console.log( "void - " + delta_void + " cells" );
      }else{
        console.log( "void" );
      }
    }

    // ToDo: count heap cells, busy, free, total, etc.

    // voids are calls to primitives sometimes
    if( type( c ) == type_void
    &&  name( c ) != tag( "_dynrc" )
    &&  name( c ) != tag( "_dynsz" )
    &&  name( c ) != tag( "_dynxt" )
    ){
      console.log( "" + c + ": " + dump( c )
      + " - " + inox_machine_code_cell_to_text( c ));
    }else{
      console.log( "" + c + ": " + dump( c ) );
    }
    count++;
    last = c;
  }
  const total_cells = count + count_voids;
  console.log(
    "Total: "
    + ( total_cells ) + " cells, "
    + count                        + " busy & "
    + count_voids                  + " void, "
    + total_cells * ONE + " words & "
    + total_cells * size_of_cell   + " bytes, "
    + count       * size_of_cell   + " bytes busy & "
    + count_voids * size_of_cell   + " bytes void"
  );
  return count;
}

/*}*/


/* -----------------------------------------------------------------------------
 *  Float, Array, Map, List
 *  ToDo: Currently implemented as proxy objects
 *  ToDo: implement arrays as dynamically allocated arrays of cells
 *  ToDo: implement maps as dynamically allocated arrays of cells
 *  ToDo: implement lists using name and value of cell?
 */

/*!c{*/

/**/ function set_float_cell( c : Cell, f : number ){
/*c void      set_float_cell( Cell, double f       ){  c*/
  set_proxy_cell( c, f );
}


/**/ function set_array_cell( c : Cell, obj? : Object ){
/*c  void     set_array_cell( Cell,     void* obj     ){  c*/
  let array = obj;
  if( ! obj ){
    array = new Array< Cell >();
  }
  set_proxy_cell( c, make_proxy( array ) );
}


/**/ function set_map_cell( c : Cell, obj? : Object ){
/*c  void     set_map_cell( Cell,     void* obj     ){  c*/
  let map = obj;
  if( ! obj ){
    map = new Map< InoxOid, Cell >();
  }
  set_proxy_cell( c, make_proxy( map ) );
}


/**/ function set_list_cell( c : Cell, obj? : Object ){
/*c  void     set_list_cell( Cell,     void* obj     ){  c*/
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
/**/ let  ACTOR : Cell;
/*c  Cell ACTOR;  c*/

// The base of the data stack of the current actor
/**/ let   ACTOR_data_stack : Cell;
/*c  Cell  ACTOR_data_stack;  c*/

// The base of the control stack of the current actor
/**/ let  ACTOR_control_stack : Cell;
/*c  Cell ACTOR_control_stack;  c*/


// The upper limit of the data stack of the current actor
/**/ let  ACTOR_data_stack_limit : Cell;
/*c  Cell ACTOR_data_stack_limit;  c*/

// The upper limit of the control stack of the current actor
/**/ let  ACTOR_control_stack_limit : Cell;
/*c  Cell ACTOR_control_stack_limit;  c*/

// Names for classes and attributes
const tag_actor          = tag( "actor" );
const tag_data_stack     = tag( "data-stack" );
const tag_control_stack  = tag( "control-stack" );
const tag_ip             = tag( "ip" );
const tag_tos            = tag( "tos" );
const tag_csp            = tag( "csp" );


/**/ function make_actor( ip : Cell ) : Cell {
/*c  Cell     make_actor( Cell ip ){  c*/

  // Allocate an object with 6 slots
  let actor = stack_allocate( 6 );

  // Set the class name to "actor" instead of default "stack"
  set_name( actor, tag_actor );

  // ToDo: avoid allocation using a global variable?
  let tmp = allocate_cell();

  // Allocate a data stack for the actor
  let dstk = stack_allocate( 100 );
  // Set the class name to "data-stack" instead of default "stack"
  set_name( dstk, tag_data_stack );

  // Allocate a control stack for the actor
  let cstk = stack_allocate( 100 );
  // Set the class name to "control-stack" instead of default "stack"
  set_name( cstk, tag_control_stack );

  // Now fill the object with the first 3 slots

  set( tmp, type_reference, tag_data_stack, dstk );
  stack_push( actor, tmp );   // offset 1, /data-stack

  set( tmp, type_reference, tag_control_stack, cstk );
  stack_push( actor, tmp );   // offset 2, /control-stack

  set( tmp, type_integer, tag_ip, ip );
  stack_push( actor, tmp );   // offset 3, /ip

  // The 3 next slots are to save the CPU context: ip, tos, csp
  set( tmp, type_integer, tag_ip, ip );
  stack_push( actor, tmp );   // offset 4, /ip

  set( tmp, type_integer, tag_tos, dstk );
  stack_push( actor, tmp );   // offset 5, /tos

  set( tmp, type_integer, tag_csp, cstk );
  stack_push( actor, tmp );   // offset 6, /csp

  free_cell( tmp );

  de&&mand_actor( actor );

  return actor;
}

/**/ function mand_actor( actor : Cell ) : boolean {
/*c  bool     mand_actor( Cell actor ){  c*/

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


/**/ function actor_save_context(){
/*c  void     actor_save_context(){  c*/
// Save context (ip, tos, csp) of current actor
  check_de&&mand_actor( ACTOR );
  set_value( ACTOR + 4 * ONE, IP );
  set_value( ACTOR + 5 * ONE, TOS );
  set_value( ACTOR + 6 * ONE, CSP );
}


/**/ function actor_restore_context( actor : Cell ){
/*c  void     actor_restore_context( Cell actor ){  c*/
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


/**/ function init_root_actor(){
/*c  int      init_root_actor(){  c*/
  actor_restore_context( make_actor( 0 ) );
  /*c return 0; */
}

/*c int dummy_init_root_actor = c*/
init_root_actor();


/* ----------------------------------------------------------------------------
 *  Error handling
 *  ToDo: should abort unless some exception handler was set up
 */

/**/ function FATAL( message : text ){
/*c  void     FATAL( text message   ){  c*/
  // Display error and stacks. Clear stack & get back to eval loop
  bug( S()+ "\nFATAL: " + message + "\n" + stacks_dump() );
  debugger;
  // ToDo: should push something to get back to eval loop
  primitive_clear_control();
  IP = 0;
}


/* -----------------------------------------------------------------------
 *  Primitives
 */

const tag_inox_return = tag( "inox-return" );

/**/ function  primitive_function_by_tag( id : Index ) : Primitive {
/*c  Primitive primitive_function_by_tag( Index id   )             {  c*/
  return get_primitive( id );
}


/**/ function primitive_exists( n : Tag ) : boolean {
/*c  bool     primitive_exists( Index n )           {  c*/
  return primitive_function_by_tag( n ) != no_operation;
}


/*
 *  C code generation
 *  The idea is to generate a valid C code file that includes everything
 *  needed to run an Inox program or to integrate Inox as a C library.
 */

// Not on metal
/*!c{*/

let C_source = "#include \"inox.h\"\n#include \"inox.cpp\"\n";


function simplify_js_primitive( n : text, source : text ){
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

function build_targets(){
// Build the C++ and AssemblyScript targets

  const source = require( "fs" ).readFileSync( "lib/inox.ts", "utf8" );

  let all_primitive_declarations = "";

  let ts = source.split( "\n" );
  /**/ let c_source = "";
  /*c  std::string c_source( "" ); c*/

  let ii = 0;
  let line = "";
  let len = ts.length;
  len = 9845;
  /**/ let begin = "/" + "*";
  /*c  std::string begin( "/" "*" ); c*/
  /**/ let end   = "*" + "/";
  /*c  std::string end( "*" "/" ); c*/

  for( ii = 0; ii < len; ii++ ){
    line = ts[ ii ]

    // rest of line is removed
    .replace( /^\s*\/\*\*\/(.*$)/, " //ts $1 " )

    // _*c & c*_ are removed when alone on a line
    .replace( /^\/\*c$/, " // c code begin" )
    .replace( /^c\*\/$/, " // c code end"   )

    // c line
    .replace(
      /^\s*\/\*c (.+?) c\*\//,      "$1 // c line"
    )

    // start of not c version
    .replace(
      begin + "!c{" + end,   " /" + "* ts begin {"
    )

    // start of c
    .replace(
      begin + "c{",      " // c begin {"
    )

   // end of ts, start of c
    .replace(
      begin + "}{",      " } ts end, c begin { *" + "/" )

    // end of c
    .replace(
      "}" + end,       " // } c end"
    )

    //
    .replace(
      begin +"}",       end + " // ts end }"
    )

    // _*de*_ debug lines are removed
    .replace( /\/\*de\*\/(.*$)/, " //de $1" )

    // de&&... debug lines are removed too
    .replace( /^\s*(de&&.*$)/, " //de&& $1" )

    // Collect all primitives
    .replace( /^\s*primitive\(\s+"([\w\-?]+)",\s+(\w+)\s*\);$/,
      function( match, p1, p2, p3 ){
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    )
    .replace( /^\s*operator_primitive\(\s+".+",\s+(\w+)\s*\);$/,
      function( match, p1, p2, p3 ){
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    )
    .replace( /^\s*immediate_primitive\(\s+"([\w\-?]+)",\s+(\w+)\s*\);$/,
    function( match, p1, p2, p3 ){
      all_primitive_declarations += "\n" + match;
      return "// postponed: " + match;
    } )
    .replace( /^\s*\/\*P\*\/.*$/,
    function( match, p1, p2, p3 ){
      all_primitive_declarations += "\n" + match;
      return "// postponed: " + match;
    } )

    .replace( /^[^\/]*let /,   " i32 " )
    .replace( /const /,   " i32 " )
    .replace( /function /, " void " )
    ;

    c_source += line + "\n";
  }

  c_source = c_source.replace( "ALL_PRIMITIVE_" + "DECLARATIONS", all_primitive_declarations );

  require( "fs" ).writeFileSync( "builds/inox.cpp", c_source, "utf8" );

  let as_source = "";
  for( ii = 0; ii < ts.length; ii++ ){
    line = ts[ ii ]

    // _ts_, rest of line is removed
    .replace( /\/\*ts\*\/(.*$)/, "//ts $1 " )

    // _as_, rest of line is kept as code
    .replace( /\/\*as\*\/(.*$)/, "$1 //as" );

    as_source += line + "\n";
  }

  require( "fs" ).writeFileSync( "builds/inox.as.ts", as_source, "utf8" );

}

/*}*/


/* ----------------------------------------------------------------------------
 *
 */

/*
 *  inox-is-a-primitive primitive
 */

const tag_is_a_primitive = tag( "inox-a-primitive?" );

primitive( "inox-is-a-primitive", primitive_is_a_primitive );
/**/ function                     primitive_is_a_primitive(){
/*c  void                         primitive_is_a_primitive( void ){  c*/
  let name = eat_tag( TOS );
  let is_a_primitive = primitive_exists( name );
  set( TOS, type_boolean, tag_is_a_primitive, is_a_primitive ? 1 : 0 );
}


/*
 *  Every block terminates with a void cell that means "return"
 */

/**/ function set_return_cell( c : Cell ){
/*c  void     set_return_cell( Cell c   ){  c*/
  reset( c ); // named void instead of tag_inox_return
  de&&mand( type( c ) == type_void );
  de&&mand( name( c ) == 0 );
}


/*
 *  Helper to define a primitive
 */

/**/ function primitive( n : text, fn : Primitive ) : Tag {
/*c  Tag      primitive( std::string n,  Primitive fn   ){  c*/
  // It also defines a verb that calls that primitive

  // Assign a new primitive id to the new primitive
  let name_id = tag( n );

  // Help C code generation
  /**/ simplify_js_primitive( fn.name, fn.toString() );

  // Make a small verb that calls the primitives
  const header = allocate_cells( 3 );

  // flags and length, integer, same name as primitive
  set( header, type_integer, name_id, 2 );

  // Definition starts after that header
  const def = header + 1 * ONE;

  register_method_definition( name_id, def );
  set_verb_primitive_flag( name_id );

  // Add machine code to invoke the primitive, ie type void, see RUN()
  set( def + 0 * ONE, type_void, name_id, 0 );

  // Add "return", 0 actually.
  set_return_cell( def + 1 * ONE );;

  // Associate tag with function
  register_primitive( name_id, fn  );

  de&&mand_eq(        definition( name_id ),             def     );
  de&&mand_eq(  name( definition( name_id ) - 1 * ONE ), name_id );

  /**/ nde&&bug( verb_to_text_definition( name_id ) );

  return name_id;

}


/**/ function immediate_primitive( n : text, fn : Primitive ){
/*c  void     immediate_primitive( text n,   Primitive fn   ){  c*/
  // Helper to define an immediate primitive
// In inox-eval, immediate Inox verbs are executed instead of being
// added to the new Inox verb definition that follows the "define" verb
  primitive( n, fn );
  set_verb_immediate_flag( tag( n ) );
}


/**/ function operator_primitive( n : text, fn : Primitive ){
/*c  void     operator_primitive( text n,   Primitive fn   ){  c*/
// Helper to define an operator primitive
  primitive( n, fn );
  set_verb_operator_flag( tag( n ) );
}


primitive( "inox-return", primitive_return );
/**/ function             primitive_return(){
/*c  void                 primitive_return( void ){  c*/
// primitive "return" is jump to return address. Eqv R> IP!
  // ToDo: this should be primitive 0
  debugger;
  run_de&&bug( S()
    + "primitive, return to IP " + N( value( CSP ) )
    + " from " + N( name( CSP ) ) + "/" + tag_to_text( name( CSP) )
  );
  debugger;
  IP = eat_integer( CSP );
  CSP += ONE;
  // ToDo: detect special cases, including:
  // - spaggethi stacks, see https://wiki.c2.com/?SpaghettiStack
  // - stacks with a dynamic sizes, made of smaller stacks linked together.
  // One way to do this detection is simply to push a special verb onto
  // the control stack, say inox-grown-stack for the dynamic size case.
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


// Special case for primitive inox-return, it gets two ids, 0 and normal.
// ToDo: avoid this
/**/ de&&mand_eq( tag_void, 0x0000 );
/*P*/ register_primitive( 0, primitive_return );
// Patch verb definition to reference verb 0
/*P*/ set_return_cell( definition( tag_inox_return ) );


/**/ function trace_context( msg : text      ){
/*c  void     trace_context( std::string msg ){  c*/
  bug( S()
    + "\n" + msg
    + "\n" + stacks_dump()
    + "\nIP: " + inox_machine_code_cell_to_text( IP ) + "\n"
  );
}


/*
 *  inox-actor primitive
 */

/**/ function set_tos_name( n : Tag ){ set_name( TOS, n ); }
/*c  #define  set_tos_name( n )  set_name( TOS, n )  c*/

// Forward declaration to please C++
/*c void push_integer( Value ); c*/

primitive( "inox-actor", primitive_actor );
/**/ function            primitive_actor()      {
/*c  void                primitive_actor( void ){  c*/
// Push a reference to the current actor
  push_integer( ACTOR ); // ToDo: push_reference()?
  set_tos_name( tag_actor );
}


/*
 *  inox-switch-actor primitive
 */

primitive( "inox-switch-actor", primitive_switch_actor );
/**/ function                   primitive_switch_actor(){
/*c  void                       primitive_switch_actor( void ){  c*/
// Switch to another actor
  actor_restore_context( pop_reference() );
}


/*
 *  inox-make-actor primitive
 */

// Forward declaration to please C++
/*c i32 PUSH( void ); c*/

primitive( "inox-make-actor", primitive_make_actor );
/**/ function                 primitive_make_actor()      {
/*c  void                     primitive_make_actor( void ){  c*/
// Make a new actor with an initial ip
  // ToDo: it gets a copy of the data stack?
  const actor = make_actor( pop_integer() );
  set( PUSH(), type_reference, tag_actor, actor );
};


/*
 *  inox-breakpoint primitive
 */

primitive( "inox-breakpoint", primitive_breakpoint );
/**/ function primitive_breakpoint(){
/*c  void     primitive_breakpoint( void ){  c*/
  breakpoint();
}


/*
 *  inox-memory-dump primitive
 */

/**/ primitive( "inox-memory-dump", memory_dump );


/*
 *  inox-cast primitive
 */

primitive( "inox-cast", primitive_cast );
/**/ function           primitive_cast(){
/*c  void               primitive_cast( void ){  c*/
// Change the type of a value. That's unsafe.
  // ToDo: use tag for type
  // ToDo: check that the type is valid
  const type = pop_raw_value();
  check_de&&mand( type < type_invalid );
  set_type( TOS, type );
}


/*
 *  inox-rename primitive
 */

primitive( "inox-rename",  primitive_rename );
/**/ function              primitive_rename(){
/*c  void                  primitive_rename( void ){  c*/
// Change the name of a value. ~~ value name -- renamed_value
  const name = pop_raw_value();
  set_tos_name( name );
}


const tag_inox_rename = tag( "inox-rename" );


/*
 *  inox-goto primitive
 */

primitive( "inox-goto", primitive_goto );
/**/ function           primitive_goto(){
/*c  void               primitive_goto( void ){  c*/
// Primitive is "jump" to some relative position, a branch
  // ToDo: conditional jumps
  IP += pop_integer();
}


/* ----------------------------------------------------------------------------
 *  Primitives to tests the type of a cell
 */


/*
 *  inox-a-void? primitive
 */

/**/ function is_a_void_cell( c : Cell ) : boolean {
/*c  bool     is_a_void_cell( Cell c   )           {  c*/
  return type( c ) == type_void;
}

const tag_is_a_void = tag( "a-void?" );

primitive( "inox-a-void?", primitive_is_a_void );
/**/ function              primitive_is_a_void(){
/*c  void                  primitive_is_a_void( void ){  c*/
  const it_is = is_a_void_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_void, it_is ? 1 : 0 );
}


/*
 *  inix-a-tag? primitive
 */

/**/ function is_a_tag_cell( c : Cell ) : boolean {
/*c  bool     is_a_tag_cell( Cell c   )           {  c*/
  return type( c ) == type_tag;
}


const tag_is_a_tag = tag( "a-tag?" );

primitive( "inox-a-tag?", primitive_is_a_tag );
/**/ function             primitive_is_a_tag(){
/*c  void                 primitive_is_a_tag( void ){  c*/
  const it_is = is_a_tag_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_tag, it_is ? 1 : 0 );
}


/*
 *  inox-a-boolean? primitive
 */

/**/ function is_a_boolean_cell( c : Cell ) : boolean {
/*c  bool     is_a_boolean_cell( Cell c   )           {  c*/
  return type( c ) == type_boolean;
}


const tag_is_a_boolean = tag( "a-boolean?" );

primitive( "inox-a-boolean?", primitive_is_a_boolean );
/**/ function                 primitive_is_a_boolean(){
/*c  void                     primitive_is_a_boolean( void ){  c*/
  const it_is = is_a_boolean_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_boolean, it_is ? 1 : 0 );
}


/*
 *  inox-an-integer? primitive
 */

const tag_is_an_integer = tag( "an-integer?" );

primitive( "inox-an-integer?", primitive_is_an_integer );
/**/ function                  primitive_is_an_integer(){
/*c  void                      primitive_is_an_integer( void ){  c*/
  const it_is = is_an_integer_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_an_integer, it_is ? 1 : 0 );
}


/*
 *  inox-a-text? primitive
 */

/**/ function is_a_text_cell( c : Cell ) : boolean {
/*c  bool     is_a_text_cell( Cell c   )           {  c*/
  return type( c ) == type_text;
}


const tag_is_a_text = tag( "a-text?" );

primitive( "inox-a-text?", primitive_is_a_text );
/**/ function              primitive_is_a_text(){
/*c  void                  primitive_is_a_text( void ){  c*/
  const it_is = is_a_text_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_text, it_is ? 1 : 0 );
}


/*
 *  inox-a-reference? primitive
 */

/**/ function is_a_reference_cell( c : Cell ) : boolean {
/*c  bool     is_a_reference_cell( Cell c   )           {  c*/
  return type( c ) == type_reference;
}


const tag_is_a_reference = tag( "a-reference?" );

primitive( "inox-a-reference?", primitive_is_a_reference );
/**/ function                   primitive_is_a_reference(){
/*c  void                       primitive_is_a_reference( void ){  c*/
  const it_is = is_a_reference_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_reference, it_is ? 1 : 0 );
}


/*
 *  inox-a-verb? primitive
 */

const tag_is_a_verb = tag( "a-verb?" );

/**/ function is_a_verb_cell( c : Cell ) : boolean {
/*c  bool     is_a_verb_cell( Cell c   )           {  c*/
  return type( c ) == type_verb;
}


primitive( "inox-a-verb?", primitive_is_a_verb );
/**/ function              primitive_is_a_verb(){
/*c  void                  primitive_is_a_verb( void ){  c*/
  const it_is = is_a_verb_cell( TOS );
  if( !it_is ){ clear( TOS ); }
  set( TOS, type_boolean, tag_is_a_verb, it_is ? 1 : 0 );
}


/*
 *  inox-a-proxy? primitive
 */

/**/ function is_a_proxy_cell( c : Cell ) : boolean {
/*c  bool     is_a_proxy_cell( Cell c   )           {  c*/
  return type( c ) == type_proxy;
}


const tag_is_a_proxy = tag( "a-proxy?" );

primitive( "inox-a-proxy?", primitive_is_a_proxy );
/**/ function               primitive_is_a_proxy(){
/*c  void                   primitive_is_a_proxy( void ){  c*/
  const it_is = is_a_proxy_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_proxy, it_is ? 1 : 0 );
}


/*
 *  inox-a-flow? primitive
 */

/**/ function is_a_flow_cell( c : Cell ) : boolean {
/*c  bool     is_a_flow_cell( Cell c   )           {  c*/
  return type( c ) == type_flow;
}


const tag_is_a_flow = tag( "a-flow?" );

primitive( "inox-a-flow?", primitive_is_a_flow );
/**/ function              primitive_is_a_flow(){
/*c  void                  primitive_is_a_flow( void ){  c*/
  const it_is = is_a_flow_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_flow, it_is ? 1 : 0 );
}


/*
 *  inox-a-list? primitive
 */

/**/ function is_a_list_cell( c : Cell ) : boolean {
/*c  bool     is_a_list_cell( Cell c   )           {  c*/
  return type( c ) == type_list;
}

const tag_is_a_list = tag( "a-list?" );

primitive( "inox-a-list?", primitive_is_a_list );
/**/ function              primitive_is_a_list(){
/*c  void                  primitive_is_a_list( void ){  c*/
  const it_is = is_a_list_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_list, it_is ? 1 : 0 );
}



/* -----------------------------------------------------------------------------
 *  Forth style data stack manipulations.
 */


/*
 *  push primitive
 */

primitive( "push", primitive_push );
/**/ function      primitive_push() {
/*c  void          primitive_push( void ){  c*/
  PUSH();
}


/*
 *  pop primitive
 */

primitive( "drop", primitive_drop );
/**/ function      primitive_drop() {
/*c  void          primitive_drop( void ){  c*/
  clear( POP() );
};


/*
 *  drops primitive
 */

primitive( "drops", primitive_drops );
/**/ function       primitive_drops(){
/*c  void           primitive_drops( void ){  c*/
// Like "drop" but drops n cells from the data stack.
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    if( TOS <= ACTOR_data_stack )break;
    clear( POP() );
  }
}


/*
 *  dup primitive
 */

primitive( "dup", primitive_dup );
/**/ function     primitive_dup(){
/*c  void         primitive_dup( void ){  c*/
  copy_cell( TOS, PUSH() );
}


/*
 *  2dup primitive
 */

primitive( "2dup", primitive_2dup );
/**/ function      primitive_2dup(){
/*c  void          primitive_2dup( void ){  c*/
  const tos = TOS;
  copy_cell( tos - ONE, PUSH() );
  copy_cell( tos,       PUSH() );
}


/*
 *  ?dup primitive
 */

primitive( "?dup", primitive_dup_if );
/**/ function      primitive_dup_if(){
/*c  void          primitive_dup_if( void ){  c*/
// Like dup but only if the top of the stack is true.
  // This is the Forth style of truth, anything non zero
  if( value( TOS ) ){
    copy_cell( TOS, PUSH() );
  }
}


/*
 *  inox-dups primitive
 */

primitive( "dups", primitive_dups );
/**/ function      primitive_dups(){
/*c  void          primitive_dups( void ){  c*/
// Like "dup" but duplicates n cells from the data stack.
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    // ToDo: check overflow
    copy_cell( TOS, PUSH() );
  }
}


/*
 *  inox-nip primitive
 */

primitive( "nip", primitive_nip );
/**/ function     primitive_nip(){
/*c  void         primitive_nip( void ){  c*/
// Like "drop" but drops the second cell from the top of the stack.
  move_cell( POP(), TOS );
}


const tmp_cell = allocate_cell();


/*
 *  inox-tuck primitive
 */

primitive( "tuck", primitive_tuck );
/**/ function      primitive_tuck(){
/*c  void          primitive_tuck( void ){  c*/
// Like "nip" but pushes the second cell from the top of the stack.
  const tos = TOS;
  const tos1 = tos - ONE;
  move_cell( tos,      tmp_cell );
  move_cell( tos1,     tos );
  move_cell( tmp_cell, tos1 );
}


/*
 *  swap primitive
 */

primitive( "swap", primitive_swap );
/**/ function      primitive_swap(){
/*c  void          primitive_swap( void ){  c*/
  const tos0 = TOS;
  const tos1 = tos0 - ONE;
  move_cell( tos0,     tmp_cell );
  move_cell( tos1,     tos0 );
  move_cell( tmp_cell, tos1 );
}


/*
 *  over primitive
 */

primitive( "over", primitive_over );
/**/ function      primitive_over(){
/*c  void          primitive_over( void ){  c*/
  copy_cell( TOS - ONE, PUSH() );
}


/*
 *  rotate primitive
 */

primitive( "rotate", primitive_rotate );
/**/ function        primitive_rotate(){
/*c  void            primitive_rotate( void ){  c*/
  const tos0 = TOS;
  const tos1 = tos0 - ONE;
  const tos2 = tos1 - ONE;
  move_cell( tos0,     tmp_cell );
  move_cell( tos1,     tos0 );
  move_cell( tos2,     tos1 );
  move_cell( tmp_cell, tos2 );
}


/*
 *  roll primitive
 */

primitive( "roll", primitive_roll );
/**/ function      primitive_roll(){
/*c  void          primitive_roll( void ){  c*/
  // Like "rotate" but rotates n cells from the top of the stack.
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  const tos = TOS;
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    move_cell( tos - ii * ONE, tmp_cell );
    move_cell( tos - ( ii + 1 ) * ONE, tos + ii * ONE );
    move_cell( tmp_cell, tos - ( ii + 1 ) * ONE );
  }
}


/*
 *  pick primitive
 */

primitive( "pick", primitive_pick );
/**/ function      primitive_pick(){
/*c  void          primitive_pick( void ){  c*/
  const nth = eat_integer( TOS );
  copy_cell( TOS - nth * ONE, TOS );
}


/*
 *  inox-data-depth primitive
 */

const tag_depth = tag( "depth" );

primitive( "inox-data-depth", primitive_data_depth );
/**/ function                 primitive_data_depth(){
/*c  void                     primitive_data_depth( void ){  c*/
// Push the depth of the data stack.
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  set( PUSH(), type_integer, tag_depth, depth );
}

/*
 *  inox-clear-data primitive
 */

primitive( "inox-clear-data", primitive_clear_data );
/**/ function                 primitive_clear_data(){
/*c  void                     primitive_clear_data( void ){  c*/
// Clear the data stack.
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    clear( POP() );
  }
}


/*
 *  inox-data-dump primitive
 */

primitive( "inox-data-dump", primitive_data_dump );
/**/ function                primitive_data_dump(){
/*c  void                    primitive_data_dump( void ){  c*/
  /**/ let buf = "DATA STACK";
  /*c  std::string buf( "DATA STACK" );  c*/
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ++ii ){
    const c      = TOS + ii * ONE;
    const i      = info(         c );
    const t      = unpack_type(  i );
    const n      = unpack_name(  i );
    const n_text = tag_to_text(  n );
    const t_text = type_to_text( t );
    const v_text = cell_to_text( c );
    buf += "\n" + N( ii ) + " "
    + t_text + " " + n_text + " " + v_text;
  }
  console.log( buf );
}


/*
 *  inox-control-depth primitive
 */

primitive( "inox-control-depth", primitive_control_depth );
/**/ function                    primitive_control_depth(){
/*c  void                        primitive_control_depth( void ){  c*/
// Push the depth of the control stack
  const depth = ( ACTOR_control_stack - CSP ) / ONE;
  de&&mand( depth >= 0 );
  const new_tos = PUSH();
  init_cell( new_tos, depth, pack( type_integer, tag_depth ) );
}


/*
 *  inox-clear-control primitive
 */

const tag_inox_clear_control = tag( "inox-clear-control" );

primitive( "inox-clear-control", primitive_clear_control );
/**/ function                    primitive_clear_control(){
/*c  void                        primitive_clear_control( void ){  c*/
// Clear the control stack
  while( CSP > ACTOR_control_stack ){
    clear( CSP );
    CSP -= ONE;
  }
  CSP = ACTOR_control_stack;
  // Add a return to IP 0 so that return from verb exits RUN() properly
  set( CSP, type_integer, tag_inox_clear_control, 0 );
}


/*
 *  inox-control-dump primitive
 */

/*!c{*/

primitive( "inox-control-dump", primitive_control_dump );
/**/ function                   primitive_control_dump(){
/*c  void                       primitive_control_dump( void ){  c*/
// Dump the control stack.
  const depth = ( CSP - ACTOR_control_stack ) / ONE;
  let buf = "Control stack:";
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    const c      = CSP - ii * ONE;
    const i      = info(         c );
    const t      = unpack_type(  i );
    const n      = unpack_name(  i );
    const n_text = tag_to_text(  n );
    const t_text = type_to_text( t );
    const v_text = cell_to_text( c );
    buf += "\n" + ii + " " + t_text + " " + n_text + " " + v_text;;
  }
  console.log( buf );
}

/*}*/


/**/ function integer_to_text( v : Value ) : text { return "" + v; }
/*c
string integer_to_text( Value v ){
  return to_string( v );
}
c*/


/* -----------------------------------------------------------------------------
 *  Some memory integrity checks.
 */


/**/ function is_safe_proxy( proxy : Cell ) : boolean {
/*c  boolean is_safe_proxy( Cell proxy    )           {  c*/
  /**/ return all_proxied_objects_by_id.has( proxy )
  /*c return true; c*/
}


/**/ function is_safe_reference( pointer : Cell ) : boolean {
/*c  boolean is_safe_pointer( Cell pointer    )           {  c*/
  if( !is_safe_area( pointer ) )return false;
  return true;
}


/**/ function cell_looks_safe( c : Cell ) : boolean {
/*c  boolean cell_looks_safe( Cell c    )           {  c*/
// Try to determine if a cell looks like a valid one

  const v = value( c );
  const i = info( c );
  const t = unpack_type( i );

  let referencee = v;

  switch( t ){

  case type_boolean :
    if( v != 0 && v != 1 ){
      bug( S()
        + "Invalid boolean value, " + N( v )
        + " at " + N( c )
      );
      return false;
    }
    return true;

  case type_text :
    if( !is_safe_proxy( referencee ) ){
      bug( S()
        + "Invalid proxy for text cell, " + N( referencee )
        + " at " + N( c)
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
    const tag = v;
    if( ! is_valid_tag( tag ) ){
      bug( S()
        + "Invalid tag for cell, " + N( tag )
        + " at " + N( c )
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
    bug( S()+ "Invalid type for cell" + N( t ) + " at " + N( c ) );
    return false;

  }
}


// Forward declaration to please C++
/*c std::string proxy_to_text( Cell ); c*/
/*c std::string integer_to_text( Value ); c*/


/**/ function cell_to_text( c : Cell ) : text {
/*c  std::string    cell_to_text( Cell c   )        {  c*/
// C++ caller is expected to free the returned string
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
    return v ? "true" : no_text;
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


/**/ function is_a_tag_singleton( c : Cell ) : boolean {
/*c  boolean  is_a_tag_singleton( Cell c   )           {  c*/
  if( !is_a_tag_cell( c ) )return false;
  // xx:/xx magic marker
  return ( value( c ) == c || c == 0 );
}


// The header of each block of machine codes.
// ToDo: create a "definition" type?
const tag_inox_block = tag( "inox-block" );


/**/ function is_a_block_cell( c : Cell ) : boolean {
/*c  boolean  is_a_block_cell( Cell c   )           {  c*/
  return name( c ) == tag_inox_block;
}


/**/ function is_a_verb_block( c : Cell ) : boolean {
/*c  boolean  is_a_verb_block( Cell c   )           {  c*/
// True when block is the definition of a verb vs inline code.
  return is_a_block_cell( c ) && !is_an_inline_block_cell( c );
}


/**/ function block_dump( ip : Cell ) : text {
/*c  string   block_dump( Cell ip   )        {  c*/
  de&&mand( is_a_block_cell( ip ) );
  /*!c{*/
  const length = block_length( ip );
  let buf = "";
  buf += "Block " + ip + ", length " + length;
  // ToD: decode flags
  if( is_immediate_verb( name( ip ) ) ){
    buf += ", immediate";
  }
  if( is_an_inline_block_cell( ip ) ){
    buf += ", inline {]";
  }else{
    buf += ", verb definition";
  }
  return buf;
  /*}{
    return "ToDo: block_dump()";
  }*/
}


let cell_dump_entered = false;

/**/ function    dump( c : Cell ) : text {
/*c  std::string dump( Cell c   )        {  c*/

  // Detect recursive calls
  if( cell_dump_entered ){
    /**/ return "Error, reentered cell_dump( " + c + " )";
    /*c return "Error, reentered cell_dump()"; c*/
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

  /**/ let buf : text = "";
  /*c  std::string  buf( "" ); c*/

  switch( t ){

    case type_void :

      if( n == tag_dynamic_ref_count ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c ) ) ){
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          return "busy " + v;
        }

      }else if( n == tag_dynamic_next_area ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c ) ) ){
          buf += "Invalid dynamic free area, ";
        }else{
          cell_dump_entered = false;
          return "free " + v;
        }

      }else if( n == tag_dynamic_area_size ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c - ONE ) ) ){
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          if( is_busy_area( header_to_area( c - ONE ) )){
            let length = ( v - 2 * size_of_cell ) / size_of_cell;
            // 0 length is what proxied objects use
            if( length == 0 ){
              const proxy_id = c + ONE;
              /**/ const obj = proxied_object_by_id( proxy_id );
              /**/ const proxy_class_name = obj.constructor.name;
              /*c  std::string proxy_class_name( "c_string" ); c*/
              buf += " - <PROXY-" + N( proxy_id ) + ">"
              + proxy_class_name + "@" + N( c ) + ">";
              if( teq( proxy_class_name, "String" )
              ||  teq( proxy_class_name, "c_string" )
              ){
                /**/ let txt = proxy_to_text( proxy_id );
                /*c  std::string txt = proxy_to_text( proxy_id ); c*/
                if( tlen( txt ) == 0){
                  txt += "<empty>";
                  if( proxy_id != value( the_empty_text_cell ) ){
                    txt += " - ERROR: not the_empty_text_cell";
                  }
                }
                if( tlen( txt ) > 31 ){
                  txt = tcut( txt, 31 ) + "..." + tlen( txt );
                }
                buf += " " + txt;
              }
              return buf;
            }else{
              return S()+ "length "
              + N( ( v - 2 * size_of_cell ) / size_of_cell );
            }
          }else{
            return S()+ "size " + N( v );
          }
        }

      }else if( n == tag_inox_block ){
        // Block description often comes next
        if( is_a_block_cell( c + ONE ) ){
          cell_dump_entered = false;
          return S()+ "inox-block definition";
        }
      }

      if( n != tag_void || v != 0 ){
        buf += tag_to_text( n );
      }
      if( v == 0 ){
        // buf += ":<void>";
      }else{
        buf += ":<void:" + v + ">";
      }
    break;

    case type_boolean :
      if( n != tag_boolean ){
        buf += tag_to_text( n ) + ":";
      }
      buf += v ? "true" : "false";
    break;

    case type_tag :
      if( n == v ){
        buf += "/" + tag_to_text( n );
        if( is_a_tag_singleton( c ) ){
          buf += " - <SINGLETON>";
        }
      }else{
        buf += tag_to_text( n ) + ":/" + tag_to_text( v );
      }
    break;

    case type_integer :
      if( n == tag_inox_block ){
        const block_dump_text = block_dump( c );
        cell_dump_entered = false;
        return block_dump_text;
      }
      if( n != tag_integer ){
        buf += tag_to_text( n ) + ":";
      }
      buf += integer_to_text( v );
    break;

    case type_reference :
      // ToDo: add class
      const class_name_tag = name( v );
      buf += tag_to_text( n )
      + "<" + tag_to_text( class_name_tag ) + "@" + v + ">";
    break;

    case type_proxy :
      const obj = proxied_object_by_id( v );
      /**/ const proxy_class_name = obj.constructor.name;
      /*c const std::string proxy_class_name( "c_string" ); c*/
      buf += tag_to_text( n )
      + "<proxied-" + proxy_class_name + "@" + N( v ) + ">";
    break;

    case type_text :
      let text = cell_to_text( c );
      // ToDo: truncate somewhere else
      if( tlen( text ) > 31 ){
        text = tcut( text, 31 ) + "..." + tlen( text );
      }
      if( n != tag_text ){
        buf += tag_to_text( n )  + ":";
      }
      // ToDo: better escape
      /**/ text = text
      /**/ .replace( "\n",  () => "\\n"  )
      /**/ .replace( "\"",  () => "\\\"" )
      /**/ .replace( "\t",  () => "\\t"  )
      /**/ .replace( "\r",  () => "\\r"  )
      /**/ .replace( "\\",  () => "\\\\" )
      buf += "\"" + text + "\"";
      if( c == the_empty_text_cell ){
        buf += " - <SINGLETON>";
      }else if( tlen( text ) == 0 && v != 0 ){
        buf += " - <INVALID_EMPTY_TEXT>";
      }
    break;

    case type_verb :
      // ToDo: add name
      buf += tag_to_text( n );
      if( v != 0 ){
        buf += ":<verb:" + N( v ) + ">";
      }
    break;

    case type_flow :
      // ToDo: add name
      buf += tag_to_text( n ) + ":<flow:" + N( v ) + ">";
    break;

    default :
      de&&mand( false );
      buf += tag_to_text( n ) + ":<invalid type " + N( t ) + ":" + v + ">";
      breakpoint()
    break;

  }

  cell_dump_entered = false;

  buf += " - " + N( t ) + "/" + N( n ) + "/" + N( v )
  + " " + type_to_text( t ) + " @" + N( c )
  + ( is_valid ? "" : " - INVALID" );
  return buf;

}


/**/ function    stacks_dump() : text {
/*c  std::string stacks_dump( void )  {  c*/
// Returns a text dump of the cells of the data and control stacks, stack trace

  const tos = TOS;
  const csp = CSP;

  /**/ let buf   = "\nDATA STACK:";
  /*c std::string buf( "\nDATA STACK:" );  c*/
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
    buf += "\nData stack underflow, top " + N( tos ) + ", base " + N( base )
    + ", delta " + N( tos - base )
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
    buf += "\nControl stack underflow, top " + N( csp )
    + ", base " + N( return_base )
    + ", delta " + ( csp - return_base )
    + ", excess pop " + ( ( csp - return_base ) / ONE );
    // ToDo: fatal error?
    some_dirty = true;
    // return_base = ptr + 5 * ONE;
  }

  nn = 0;
  let ip = 0 ;
  let name = "";
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
 *  inox-debugger primitive
 */

primitive( "inox-debugger", primitive_debugger );
/**/ function               primitive_debugger(){
/*c  void                   primitive_debugger( void ) {  c*/
// Invoke host debugger if any. In C++, please set a breakpoint here
  /*c *( char * ) 0 = 0;  c*/
  /**/ debugger;
}


/*
 *  inox-debug primitive
 */

primitive( "inox-debug", primitive_debug );
/**/ function            primitive_debug(){
/*c  void                primitive_debug( void ) {  c*/
// Activate lots of trace and invoke host debugger if any
  debug();
  debugger;
}


/*
 *  inox-no-debug primitive
 */

primitive( "inox-no-debug", primitive_no_debug );
/**/ function               primitive_no_debug(){
/*c  void                   primitive_no_debug( void ) {  c*/
// Deactivate lots of traces
  no_debug();
}


/*
 *  inox-log primitive
 */

primitive( "inox-log", primitive_log );
/**/ function          primitive_log(){
/*c  void              primitive_log( void ) {  c*/
// Control logging of trace messages
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
        eval_de = true;
      }
      if( domain_id == tag( "step" ) ){
        step_de = true;
      }
      if( domain_id == tag( "run" ) ){
        run_de = true;
      }
      if( domain_id == tag( "stack" ) ){
        stack_de = true;
      }
      if( domain_id == tag( "token" ) ){
        token_de = true;
      }
      clear( domain_cell );
    }else if( verb == tag( "disable" ) ){
      // ToDo: implement this
      const domain_cell = POP();
      const domain_id = value( domain_cell );
      if( domain_id == tag( "eval" ) ){
        eval_de = false;
      }
      if( domain_id == tag( "step" ) ){
        step_de = false;
      }
      if( domain_id == tag( "run" ) ){
        run_de = false;
      }
      if( domain_id == tag( "stack" ) ){
        stack_de = false;
      }
      if( domain_id == tag( "token" ) ){
        token_de = false;
      }
      clear( domain_cell );
    }
  }
  clear( verb_cell );
}


/*
 *  inox-faster primitive
 */

const tag_faster = tag( "faster" );

primitive( "inox-faster", primitive_faster );
/**/ function             primitive_faster(){
/*c  void                 primitive_faster( void ) {  c*/
// Turbo mode, no checks, no debug, no trace. Return previous state.
  // ToDo: per actor?
  check_de&&mand_boolean( TOS );
  const was_turbo = de;
  if( value( TOS ) ){
    no_debug_at_all();
  }else{
    no_debug();
  }
  set_value( TOS, was_turbo ? 1 : 0 );
  set_tos_name( tag_faster );
}


/*
 *  inox-assert-checker primitive - internal
 */

primitive( "inox-assert-checker", primitive_assert_checker );
/**/ function                     primitive_assert_checker(){
/*c  void                         primitive_assert_checker( void ) {  c*/
// This primitive gets called after an assertion block has been executed.

  // Expect assertions to provide a boolean result!
  mand_boolean( TOS );

  // If the assertion failed, fatal error is raised
  if( pop_raw_value() == 0 ){
    FATAL( "Assertion failed" );
    return;
  }

  // Return to where inox-assert was called
  IP = eat_integer( CSP );
  CSP -= ONE;

}


const tag_inox_assert_checker = tag( "inox-assert-checker" );
const assert_checker_definition = definition( tag_inox_assert_checker );


/*
 *  inox-assert primitive
 */

/**/ function save_ip( label : Tag ){
/*c  void     save_ip( Tag label ){  c*/
  CSP += ONE;
  set( CSP, type_integer, label, IP );
}


const tag_inox_assert = tag( "inox-assert" );

primitive( "inox-assert", primitive_assert );
/**/ function             primitive_assert(){
/*c  void                 primitive_assert( void ) {  c*/
// Assert that a condition is true, based on the result of a block

  // Do not execute the assertion block, if fast mode is on
  if( !de ){
    pop_raw_value();
    return;
  }

  check_de&&mand_block( TOS );

  // Save return address
  save_ip( tag_inox_assert );

  // Insert assertion checker so that block will return to it
  CSP += ONE;
  set( CSP, type_integer, tag_inox_assert_checker, assert_checker_definition );

  // Jump into block definition, on return it will run the assertion checker
  IP = pop_raw_value();

}


/*
 *  noop primitive
 */

primitive( "inox-noop", primitive_noop );
/**/ function           primitive_noop(){
/*c  void               primitive_noop( void ) {  c*/
// No operation - does nothing
}


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


primitive( "inox-type", primitive_type );
/**/ function           primitive_type(){
/*c void                primitive_type( void ) {  c*/
// Get type as a tag
  const tag = type_to_tag( type( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_type, tag );
}


primitive( "inox-name", primitive_name );
/**/ function           primitive_name(){
/*c void                primitive_name( void ) {  c*/
// Get name as a tag
  const n = name( TOS );
  clear( TOS );
  set( TOS, type_tag, tag_name, n );
}


primitive( "inox-value", primitive_value );
/**/ function            primitive_value(){
/*c void                 primitive_value( void ) {  c*/
// Get value as an integer
  let v = value( TOS );
  clear( TOS );
  set( TOS, type_integer, tag_value, v );
}


primitive( "inox-info", primitive_info );
/**/ function           primitive_info(){
/*c void                primitive_info( void ) {  c*/
// Get info as an integer, see inox-pack-info
  let i = info( TOS );
  clear(   TOS );
  set(     TOS, type_integer, tag_info, i );
}


primitive( "inox-pack-info", primitive_pack_info );
/**/ function                primitive_pack_info(){
/*c  void                    primitive_pack_info( void ) {  c*/
// Pack type and name into an integer, see inox-unpack-type and inox-unpack-name
  const name_cell = POP();
  const type_cell = TOS;
  const type_id = tag_to_type( value( type_cell ) );
  de&&mand( type_id != type_invalid );
  const info = pack( type_tag, value( name_cell ) );
  clear( type_cell );
  clear( name_cell );
  init_cell(  TOS, info, pack( type_integer, tag_info ) );
}


primitive( "inox-unpack-type", primitive_unpack_type );
/**/ function                  primitive_unpack_type(){
/*c  void                      primitive_unpack_type( void ) {  c*/
// Unpack type from an integer, see inox-pack-info
  const info    = value( TOS );
  const typ     = unpack_type( info );
  const typ_tag = type_to_tag( typ );
  clear( TOS );
  init_cell( TOS, typ_tag, pack( type_tag, tag_type ) );
}


primitive( "inox-unpack-name", primitive_unpack_name );
/**/ function                  primitive_unpack_name(){
/*c  void                      primitive_unpack_name( void ) {  c*/
// Unpack name from an integer, see inox-pack-info
  const info = value( TOS );
  const name = unpack_name( info );
  clear( TOS );
  init_cell(  TOS, name, pack( type_tag, tag_name ) );
}


/* ---------------------------------------------------------------------------
 *  Some type checking. They work only when the global "de" flag is set.
 *  This is true if the interpreter was compiled in so called debug or
 *  development mode. Once a program is considered deployable, it is usually
 *  run by a runtime that does not provide most of the facilities that
 *  are available in debug/development mode, for speed reasons and compactness.
 */

/**/ function type_to_text( type_id : Index ) : text {
/*c  std::string    type_to_text( Index type_id   )        {  c*/
// Convert a type id, 0..15, into a text.
  if( type_id < 0 || type_id >= type_invalid ){
    return "invalid";
  }
  return all_symbol_texts[ type_id ];
}


/**/ function type_to_tag( type_id : Index ) : Tag {
/*c  Tag      type_to_tag( Index type_id   )       {  c*/
// Convert a type id, 0..15, into it's tag.
  if( type_id < 0 || type_id >= type_invalid )return tag_invalid;
  if( type_id == type_void )return tag_void;
  return type_id;
}


/**/ function tag_to_type( tag : Tag ) : Type {
/*c  Type     tag_to_type( Tag tag   )        {  c*/
// Convert a tag into a type id
  if( tag == tag_void    )return 0;
  if( tag < type_invalid )return tag;
  return type_invalid;
}


/**/ function type_name_to_type( n : text ) : Type {
/*c  Type     type_name_to_type( std::string n  )        {  c*/
// Convert a type text name into a type id in range 0..9 where 9 is invalid
  const idx = symbol_lookup( n );
  if( idx > type_invalid )return type_invalid;
  return idx;
}


/**/ function cell_class_tag( c : Cell ) : Tag {
/*c  Tag      cell_class_tag( Cell c   )       {  c*/
// Get the most specific type of a cell's value
  const t = type( c );
  // For references, it's the name stored in the first cell of the object
  if( t == type_reference ){
    return name( value( c ) );
  }
  // For proxied object, it's the class name of the proxied object
  if( t == type_proxy ){
    /*c return tag_c_string; c*/
    /**/ const proxied_obj = proxied_object_by_id( value( c ) );
    /**/ const js_type = typeof proxied_obj;
    /**/ if( typeof proxied_obj == "object" ){
    /**/   return tag( proxied_obj.constructor.name );
    /**/ }
    return tag( js_type );
  }
  return type_to_tag( type( c ) );
}


const tag_class = tag( "class" );

primitive( "inox-class", primitive_inox_class );
/**/ function            primitive_inox_class(){
/*c  void                primitive_inox_class( void ){  c*/
// Get the most specific type name (as a tag) of the top of stack cell
  const class_tag = cell_class_tag( TOS );
  clear( TOS );
  set( TOS, type_tag, tag_class, class_tag );
}


/* ---------------------------------------------------------------------------
 *  Some ...
 */


const tag_inox_if = tag( "inox-if" );

/*c void primitive_if( void );  c*/

primitive( "inox-if", primitive_if );
/**/ function         primitive_if(){
/*c  void             primitive_if( void ){  c*/
// Run block if boolean is true
  const block = pop_block();
  if( pop_boolean() == 0 ){
    return;
  }
  // Push return address
  save_ip( tag_inox_if );
  // Jump into block
  IP = block;
}


const tag_inox_if_not = tag( "inox-if-not" );


primitive( "inox-if-not", primitive_if_not );
/**/ function             primitive_if_not(){
/*c  void                 primitive_if_not( void ){  c*/
  // Run block if boolean is true
  const block = pop_block();
  if( pop_boolean() != 0 )return;
  // Push return address
  save_ip( tag_inox_if_not );
  // Jump into block
  IP = block;
}

// Forward declaration to please C++ compiler
/*c void primitive_run( void ); c*/

primitive( "inox-if-else", primitive_if_else );
/**/ function              primitive_if_else(){
/*c  void                  primitive_if_else( void ){  c*/
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


/*
 *  >R, R>, R@, Forth style
 */


primitive( "inox-to-control", primitive_to_control );
/**/ function                 primitive_to_control(){
/*c  void                     primitive_to_control( void ){  c*/
  // >R in Forth
  CSP += ONE;
  move_cell( POP(), CSP );
}


primitive( "inox-from-control", primitive_from_control );
/**/ function                   primitive_from_control(){
/*c  void                       primitive_from_control( void ){  c*/
  // R> in Forth
  move_cell( CSP, PUSH() );
  CSP -= ONE;
}


primitive( "inox-fetch-control", primitive_fetch_control );
/**/ function                    primitive_fetch_control(){
/*c  void                        primitive_fetch_control( void ){  c*/
  // R@ in Forth
  copy_cell( CSP, PUSH() );
}


/*
 *  while primitive
 */

const tag_inox_while_2         = tag( "inox-while-2" );
const tag_inox_while_3         = tag( "inox-while-3" );
const tag_inox_goto_while_2    = tag( "inox-goto-while-2" );
const tag_inox_goto_while_3    = tag( "inox-goto-while-3" );
const tag_inox_while_body      = tag( "inox-while-body" );
const tag_inox_while_condition = tag( "inox-while-condition" );
const tag_inox_break_sentinel  = tag( "inox-break-sentinel" );
const tag_inox_loop_body       = tag( "inox-loop-body" );
const tag_inox_loop_until_2    = tag( "inox-loop-until-2" );
const tag_inox_loop_condition  = tag( "inox-while-condition" );
const tag_inox_goto_loop_2     = tag( "inox-goto-loop-2" );
const tag_inox_goto_loop_3     = tag( "inox-goto-loop-3" );
const tag_inox_looo_while      = tag( "inox-loop-while" );


primitive( "inox-while-1", primitive_while_1 );
/**/ function              primitive_while_1(){
/*c  void                  primitive_while_1( void ){  c*/
// Low level verbs to build inox-while( { condition } { body } )
  // : inox-while
  //   inox-while-1 ( save blocks in control stack )
  //   inox-while-2 ( run condition block )
  //   inox-while-3 ( if condition ok, run body & jump to while-2 )
  // . inox-inline
  const body_block      = pop_block();
  const condition_block = pop_block();
  // IP is expected to points to inox-while-2
  de&&mand_eq( name( IP ), tag_inox_while_2 );
  // Save info for inox-break-loop, it would skip to after inox-while-3
  CSP += ONE;
  set( CSP, type_integer, tag_inox_break_sentinel, IP + 2 * ONE );
  // Remember body and condition in control stack
  CSP += ONE;
  set( CSP, type_integer, tag_inox_while_body, body_block );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_while_condition, condition_block );
  // The control stack now holds:
  //   IP for inox-break, named inox-loop-sentinel
  //   IP for the body block
  //   IP for the condition block
  // Execution continues inside inox-while-2
}


primitive( "inox-while-2", primitive_while_2 );
/**/ function              primitive_while_2(){
/*c  void                  primitive_while_2( void ){  c*/
  // IP is expected to point to inox-while-3
  de&&mand_eq( name( IP ), tag_inox_while_3 );
  const condition_block = value( CSP );
  // Invoke condition, like inox-run would do
  CSP += ONE;
  set( CSP, type_integer, tag_inox_goto_while_3, IP );
  // Jump into block
  IP = condition_block;
  // The control stack now holds:
  //   IP for inox-break, named inox-break-sentinel
  //   IP for the body block, named /inox-while-body in debug mode
  //   IP for the condition block, named /inox-while-condition in debug mode
  //   IP address of inox-while-3, the condition block will return to it
}


primitive( "inox-while-3", primitive_while_3 );
/**/ function              primitive_while_3(){
/*c  void                  primitive_while_3( void ){  c*/

  let flag = pop_boolean();

  // If the condition is met, run the body and loop
  if( flag != 0 ){
    const body_block = value( CSP - ONE );
    // The inox-return of the body block must jump to inox-while-2
    CSP += ONE;
    // ip currently points after this primitive, hence while-2 is before
    set( CSP, type_integer, tag_inox_goto_while_2, IP - 2 * ONE );
    // CSP must now point to inox-while-2 primitive verb
    de&&mand_eq( name( value( CSP ) ), tag_inox_while_2 );
    // Jump into the body block
    IP = body_block;

  // The while condition is not met, it's time to exit the loop
  }else{
    // Drop break sentinel, condition and body from control stack
    // ToDo: use lookup instead of fixed value if optimistic guess failed.
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    de&&mand_eq( name( CSP - 2 * ONE ), tag_inox_break_sentinel );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
  }
}


primitive( "inox-until-3", primitive_until_3 );
/**/ function              primitive_until_3(){
/*c  void                  primitive_until_3( void ){  c*/
// Like while loop but with the boolean reversed
  if( value( TOS ) == 0 ){
    set_value( TOS, 1 );
  }else{
    set_value( TOS, 0 );
  }
  primitive_while_3();
}


/*
 *  loop primitive
 */

primitive( "inox-loop", primitive_loop );
/**/ function           primitive_loop(){
/*c  void               primitive_loop( void ){  c*/
  const body_block = pop_block();
  // Save info for inox-break-loop, it would skip to after inox-loop
  CSP += ONE;
  set( CSP, type_integer, tag_inox_break_sentinel, IP );
  // Invoke body block, it will return to itself, loopimg until some break
  CSP += ONE;
  set( CSP, type_integer, tag_inox_break_sentinel, body_block );
  // Jump into boby block
  IP = body_block;
}


/**/ function lookup_sentinel( csp : Cell, tag : Tag ) : Cell {
/*c  Cell     lookup_sentinel( Cell  csp , Tag   tag  )        {  c*/
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

primitive( "inox-break", primitive_break );
/**/ function            primitive_break(){
/*c  void                primitive_break( void ){  c*/
// Like inox-return but to exit a control structure, a non local return
  let sentinel_csp = lookup_sentinel( CSP, tag_inox_break_sentinel );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL( "inox-break sentinel is missing" );
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


/*
 *  sentinel primitive
 */

primitive( "inox-sentinel", primitive_sentinel );
/**/ function               primitive_sentinel(){
/*c  void                   primitive_sentinel( void ){  c*/
  const sentinel_name = pop_tag();
  CSP += ONE;
  set( CSP, type_integer, sentinel_name, IP );
}


/*
 *  long jump primitive
 */

primitive( "inox-long-jump", primitive_long_jump );
/**/ function                primitive_long_jump(){
/*c  void                    primitive_long_jump( void ){  c*/
// Non local return up to some sentinel set using inox-sentinel
  const sentinel_name = pop_tag();
  const sentinel_csp = lookup_sentinel( CSP, sentinel_name );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL(
      "inox-jump, missing sentinel " + tag_to_text( sentinel_name )
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


/*
 *  loop-until primitive
 */

const tag_inox_loop_until = tag( "inox-loop-until" );

primitive( "inox-until-checker", primitive_until_checker );
/**/ function                    primitive_until_checker(){
/*c  void                        primitive_until_checker( void ){  c*/
  const flag = pop_boolean();
  if( flag == 0 ){
    const body_block = value( CSP );
    CSP -= ONE;
    const condition_block = value( CSP );
    CSP += ONE;
    set( CSP, type_integer, tag_inox_loop_until, until_checker_definition );
    CSP += ONE;
    set( CSP, type_integer, tag_inox_loop_condition, condition_block );
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


primitive( "inox-while-checker", primitive_while_checker );
/**/ function                    primitive_while_checker(){
/*c  void                        primitive_while_checker( void ){  c*/
  const flag = pop_boolean();
  if( flag == 0 ){
    const body_block = value( CSP );
    CSP -= ONE;
    const condition_block = value( CSP );
    CSP += ONE;
    set( CSP, type_integer, tag_inox_loop_until, while_checker_definition );
    CSP += ONE;
    set( CSP, type_integer, tag_inox_loop_condition, condition_block );
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


const tag_inox_until_checker   = tag( "inox-until-checker" );
const until_checker_definition = definition( tag_inox_until_checker );

primitive( "inox-loop-until", primitive_loop_until );
/**/ function                 primitive_loop_until(){
/*c  void                     primitive_loop_until( void ){  c*/
  debug();
  const condition_block = pop_block();
  const body_block      = pop_block();
  CSP += ONE;
  set( CSP, type_integer, tag_inox_break_sentinel, IP );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_loop_condition, condition_block );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_loop_body, body_block );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_until_checker, until_checker_definition );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_loop_condition, condition_block );
  IP = body_block;
}


/*
 *  loop-while primitive
 */

const tag_inox_while_checker   = tag( "inox-while-checker" );
const while_checker_definition = definition( tag_inox_while_checker );

primitive( "inox-loop-while", primitive_loop_while );
/**/ function                 primitive_loop_while(){
/*c void                      primitive_loop_while( void ){  c*/
  const condition_block = pop_block();
  const body_block      = pop_block();
  CSP += ONE;
  set( CSP, type_integer, tag_inox_break_sentinel, IP );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_loop_condition, condition_block );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_loop_body, body_block );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_until_checker, while_checker_definition );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_loop_condition, condition_block );
  IP = body_block;
}


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
  n : text,
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

operator_primitive( "+", primitive_add );
/**/ function            primitive_add(){
/*c void                 primitive_add( void ){  c*/

  const target_type = type( TOS - ONE );

  if( is_a_reference_type( target_type ) ){
    // Polymorphic case, with operator overloading
    /*c bug( "ToDo: polymorphic operator" );  c*/
    /**/ dispatch_binary_operator( tag( "+" ), target_type );
    return;
  }

  push_integer( pop_integer() + pop_integer() );

}


/*
 *  =? - value equality
 */

const tag_is_equal = tag( "=?" );

/**/ function primitive_is_equal(){
/*c void      primitive_is_equal(){  c*/
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
      /*c  std::string text1( (char*) value( p1 ) );  c*/
      /*c  std::string text2( (char*) value( p2 ) );  c*/
      // ToDo: in C++, I could use strcmp()?
      clear( p2 );
      clear( p1 );
      // If same content
      if( text2 == text1 ){
        set( p1, type_boolean, tag_is_equal, 1 );
      }else{
        set( p1, type_boolean, tag_is_equal, 0 );
      }
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

operator_primitive( "<>?", primitive_is_not_equal );
/**/ function primitive_is_not_equal(){
/*c void      primitive_is_not_equal(){  c*/
  primitive_is_equal();
  set_value( TOS, value( TOS ) == 0 ? 1 : 0 );
}


/*
 *  ==? - object identicallity, ie shallow equality, not deep equality.
 */

/**/ function primitive_is_identical(){
/*c void      primitive_is_identical(){  c*/

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

operator_primitive( "not==?", primitive_is_not_identical );
/**/ function                 primitive_is_not_identical(){
/*c void                      primitive_is_not_identical( void ){  c*/
  primitive_is_identical();
  set_value( TOS, value( TOS ) == 0 ? 1 : 0 );
}


/*
 *  Generic solution for arithmetic operators
 */

/*c
#define binary_math_operator( n, fun )
c*/

/**/  function binary_math_operator( n : text, fun : Function ) : void {
/**/  // Build an operator primitive. Also built integer.xx, float.xx
/**/
/**/    operator_primitive(
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
/**/
/**/  }


/**/  function binary_boolean_operator( n : text, fun : Function ) : void {
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

/*c
#define binary_math_operator( n, fun_body )
c*/

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


/*
 *  Generic solution for arithmetic operators
 */

/**/  function unary_math_operator( n : text, fun : Function ) : void {
/**/    operator_primitive( n, /**/ function primitive_unary_operator(){
/**/      const p0 = TOS;
/**/      const r  = fun( value( p0 ) );
/**/      de&&mand( r == 0 || r == 1 );
/**/      set_value( p0, r );
/**/      set_type( p0, type_integer )
/**/    } );
/**/  }


/*
 *  Generic solution for boolean operators
 */

/**/ function unary_boolean_operator( n : text, fun : Function ) : void {
/**/   operator_primitive( n, /**/ function primitive_unary_boolean_operator(){
/**/     const p0 = TOS;
/**/     const r  = fun( value( p0 ) );
/**/     de&&mand( r == 0 || r == 1 );
/**/     set_value( p0, r );
/**/     set_type( p0, type_boolean );
/**/   } );
/**/ }


/*
 *  ? operator
 */

const tag_is_thruthy = tag( "thruthy?" );

primitive( "inox-truthy?", primitive_is_truthy );
/**/ function              primitive_is_truthy(){
/*c void                   primitive_is_truthy( void ){  c*/

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
        /*c is_empty = *(char*) value( TOS ) == 0; c*/
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
  set_tos_name( tag_is_thruthy );
}


operator_primitive( "?", primitive_is_truthy );


/*
 *  something? operator
 */

primitive( "inox-someting?", primitive_is_someting );
/**/ function                primitive_is_someting(){
/*c void                     primitive_is_someting( void ){  c*/
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


operator_primitive( "something?", primitive_is_someting );


/*
 *  void? operator
 */

primitive( "inox-void?", primitive_is_void );
/**/ function            primitive_is_void(){
/*c void                 primitive_is_void( void ){  c*/
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


operator_primitive( "void?", primitive_is_void );



/*
 *  true? operator
 */

primitive( "inox-true?", primitive_is_true );
/**/ function            primitive_is_true(){
/*c void                 primitive_is_true( void ){  c*/
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

operator_primitive( "true?", primitive_is_true );


/*
 *  false? operator
 */

primitive( "inox-false?", primitive_is_false );
/**/ function             primitive_is_false(){
/*c void                  primitive_is_false( void ){  c*/
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

operator_primitive( "false?",  primitive_is_false  );


/*
 *  not? unary operator
 */

primitive( "inox-not?", primitive_is_not );
/**/ function           primitive_is_not(){
/*c void                primitive_is_not( void ){  c*/
  check_de&&mand_boolean( TOS );
  if( value( TOS ) == 0 ){
    set_value( TOS, 1 );
  }else{
    set_value( TOS, 0 );
  }
}


operator_primitive( "not?", primitive_is_not );


/*
 *  more boolean operators
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

/*}*/


/*
 *  Some more arithmetic operators
 */

/*!c{*/

unary_math_operator( "NOT",      ( x ) => ~x                );
unary_math_operator( "negative", ( x ) => -x                );
unary_math_operator( "sign",     ( x ) => x < 0   ? -1 :  1 );
unary_math_operator( "abs",      ( x ) => x > 0   ?  x : -x );

/*}*/


/*
 *  & - text concatenation operator
 */

primitive( "inox-text-join", primitive_text_join );
/**/ function                primitive_text_join(){
/*c  void                    primitive_text_joint( void ){  c*/
// Text concatenation, t1 t2 -- t3
  /**/ const t2 = pop_as_text();
  /*c  std::string t2 = pop_as_text();  c*/
  /**/ const t1 = pop_as_text();
  /*c  std::string t1 = pop_as_text();  c*/
  push_text( t1 + t2 );
}


operator_primitive( "&", primitive_text_join );


/*
 *  text-cut primitive - extract a cut of a text, remove a suffix
 */

primitive( "inox-text-cut", primitive_text_cut );
/**/ function              primitive_text_cut(){
/*c  void                  primitive_text_cut( void ){  c*/
  const n = pop_integer();
  /**/ const t = pop_as_text();
  /*c  std::string t = pop_as_text();  c*/
  push_text( tcut( t, n ) );
}


/*
 *  text-length primitive - length of a text
 */

primitive( "inox-text-length", primitive_text_length );
/**/ function                 primitive_text_length(){
/*c  void                     primitive_text_length( void ){  c*/
  /**/ const t = pop_as_text();
  /*c  std::string t = pop_as_text();  c*/
  push_integer( tlen( t ) );
}


/*
 *  text-but primitive - remove a prefix from a text, keep the rest
 */

primitive( "inox-text-but", primitive_text_but );
/**/ function              primitive_text_but(){
/*c  void                  primitive_text_but( void ){  c*/
  const n = pop_integer();
  /**/ const t = pop_as_text();
  /*c  std::string t = pop_as_text();  c*/
  push_text( tbut( t, n ) );
}


/*
 *  text-mid primitive - extract a part of the text
 */

primitive( "inox-text-mid", primitive_text_mid );
/**/ function               primitive_text_mid(){
/*c  void                   primitive_text_mid( void ){  c*/
  const n = pop_integer();
  const m = pop_integer();
  /**/ const t = pop_as_text();
  /*c  std::string t = pop_as_text();  c*/
  push_text( tmid( t, m, n ) );
}


/*
 *  text-eq? primitive - compare two texts
 */

primitive( "inox-text-eq?", primitive_text_eq );
/**/ function               primitive_text_eq(){
/*c  void                   primitive_text_eq( void ){  c*/
  /**/ const t2 = pop_as_text();
  /*c  std::string t2 = pop_as_text();  c*/
  /**/ const t1 = pop_as_text();
  /*c  std::string t1 = pop_as_text();  c*/
  push_boolean( t1 == t2 );
}


/*
 *  text-neq primitive - compare two texts
 */

primitive( "inox-text-neq?", primitive_text_neq );
/**/ function                primitive_text_neq(){
/*c  void                    primitive_text_neq( void ){  c*/
  /**/ const t2 = pop_as_text();
  /*c  std::string t2 = pop_as_text();  c*/
  /**/ const t1 = pop_as_text();
  /*c  std::string t1 = pop_as_text();  c*/
  push_boolean( t1 != t2 );
}


/*
 *  text-find primitive - find a piece in a text
 */

primitive( "inox-text-find", primitive_text_find );
/**/ function                primitive_text_find(){
/*c  void                    primitive_text_find( void ){  c*/
  /**/ const t2 = pop_as_text();
  /*c  std::string t2 = pop_as_text();  c*/
  /**/ const t1 = pop_as_text();
  /*c  std::string t1 = pop_as_text();  c*/
  push_integer( tidx( t1, t2 ) );
}


/*
 *  text-find-last primitive - find a piece in a text
 */

primitive( "inox-text-find-last", primitive_text_find_last );
/**/ function                     primitive_text_find_last(){
/*c  void                         primitive_text_find( void ){  c*/
  /**/ const t2 = pop_as_text();
  /*c  std::string t2 = pop_as_text();  c*/
  /**/ const t1 = pop_as_text();
  /*c  std::string t1 = pop_as_text();  c*/
  push_integer( tidxr( t1, t2 ) );
}


/*
 *  text-line primitive - extract a line from a text
 */

primitive( "inox-text-line", primitive_text_line );
/**/ function                primitive_text_line(){
/*c  void                    primitive_text_line( void ){  c*/
  const n = pop_integer();
  /**/ const t = pop_as_text();
  /*c  std::string t = pop_as_text();  c*/
  push_text( extract_line( t, n ) );
}


/*
 *  as-text primitive - textual representation
 */

primitive( "inox-as-text", primitive_as_text );
/**/ function              primitive_as_text(){
/*c void                   primitive_as_text( void ){  c*/
  if( type( TOS ) == type_text )return;
  push_text( pop_as_text() );
}


/*
 *  dump primitive - textual representation, debug style
 */

primitive( "inox-dump", primitive_dump );
/**/ function           primitive_dump(){
/*c  void               primitive_dump( void ){  c*/
  push_text( dump( POP() ) );
}



/*
 *  ""? unary operator
 */

const the_empty_text_value = value( the_empty_text_cell );
// de&&mand_eq( the_empty_text_value, 0 );

const tag_empty_text = tag( "empty?" );


/**/ function is_empty_text_cell( c : Cell ) : boolean {
/*c  bool     is_empty_text_cell( Cell c  )            {  c*/
  if( type( c ) != type_text )return false;
  if( value( c ) == the_empty_text_value )return true;
  /*c if( *(char*) value( c ) == 0 )return true;  c*/
  return false;
}


operator_primitive( "\"\"?", primitive_is_empty_text );
/**/ function                primitive_is_empty_text(){
/*c void                     primitive_is_empty_text( void ){  c*/
// True only if value is the empty text.
  if( type( TOS ) != type_text ){
    clear( TOS );
    set( TOS, type_boolean, tag_empty_text, 0 );
  }else{
    const it_is = is_empty_text_cell( TOS );
    clear( TOS );
    set( TOS, type_boolean, tag_empty_text, it_is ? 1 : 0 );
  }
}


/*
 *  named? operator
 */

const tag_is_named = tag( "named?" );

operator_primitive( "named?", primitive_is_named );
/**/ function                 primitive_is_named(){
/*c  void                     primitive_is_named( void ){  c*/
// True if NOS's name is TOS tag
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

primitive( "inox-named?", primitive_is_named );


/* -----------------------------------------------------------------------------
 *
 */

/**/ function    inox_machine_code_cell_to_text( c : Cell ){
/*c  std::string inox_machine_code_cell_to_text( Cell c   ){  c*/
// Decompilation of a single machine code.

  // What type of code is this, Inox verb, primitive, literal, jump?
  let t;
  let n;
  /**/ let name_text : string;
  /*c  std::string name_text;  c*/
  /**/ let fun : Primitive;
  /*c  Primitive fun;  c*/

  t = type( c );
  n = name( c );

  // If code is a primitive. That's when type is void; what a trick!
  if( t == type_void ){

    if( get_primitive( n ) == no_operation ){
      debugger;
      return S()+ "Invalid primitive cell " + N( c )
      + " named " + N( n ) + " (" + tag_to_text( n ) + ")";
    }

    fun = get_primitive( n );
    name_text = tag_to_text( n );
    return S()+ name_text + " ( cell " + N( c )
    + " is primitive " + F( fun ) + " )";

  // If code is the integer id of a verb, an execution token, xt in Forth jargon
  }else if ( t == type_verb ){
    name_text = tag_to_text( n );
    if( n == 0x0000 ){
      debugger;
      return S()+ name_text + " inox-return ( cell " + N( c )
      + " is verb inox-return 0x0000 )";
    }
    return S()+ name_text + " ( cell " + N( c ) + " is a verb )";

  // If code is a literal
  }else{
    return S()+ dump( c ) + " ( cell " + N( c ) + " is a literal )";
  }

}


/**/ function verb_flags_dump( flags : u32 ){
/*c  string   verb_flags_dump( u32 : flags ){  c*/
// Return a text that describes the flags of an Inox verb.
  let buf = "";
  if( ( flags & immediate_verb_flag ) == immediate_verb_flag ){
    buf += " immediate";
  }
  if( ( flags & hidden_verb_flag ) == hidden_verb_flag ){
    buf += " hidden";
  }
  if( ( flags & operator_verb_flag ) == operator_verb_flag ){
    buf += " operator";
  }
  if( ( flags & block_verb_flag ) == block_verb_flag ){
    buf += " block";
  }
  if( ( flags & inline_verb_flag ) == inline_verb_flag ){
    buf += " inline";
  }
  if( ( flags & primitive_verb_flag ) == primitive_verb_flag ){
    buf += " primitive";
  }
  return buf;
}


/**/ function verb_to_text_definition( id : Index ) : text {
/*c  string   verb_to_text_definition( id : Index ) : text {  c*/

  // Return the decompiled source code that defines the Inox verb.
  // A non primitive Inox verb is defined using an array of cells that
  // are either other verbs, primitives or literal values

  let text_name = tag_to_text( id );

  // The definition is an array of cells
  let def : Cell = definition( id );

  // The prior cell stores flags & length
  let flags_and_length = value( def - ONE );
  let flags  = flags_and_length & verb_flags_mask;
  let length = flags_and_length & verb_length_mask;

  // ToDo: add a pointer to the previous verb definition

  let buf = ": " + text_name + " ( definition of " + text_name + ", verb " + id
  + ", cell " + def
  + ( flags != 0 ? ", flags" + verb_flags_dump( flags ) : "" )
  + ", length " + length + " )\n";

  let ip : Index = 0;
  let c  : Cell;

  while( ip < length ){
    c = def + ip * ONE;
    // Filter out final "return"
    if( ip + 1 == length ){
      de&&mand_eq( value( c ), 0x0 );
      de&&mand_eq( type(  c ), type_void );
    }
    buf += "( " + ip + " ) " + inox_machine_code_cell_to_text( c ) + "\n";
    ip++;
  }

  return buf;

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
 *  peek primitive
 */

primitive( "inox-peek", primitive_peek );
/**/ function           primitive_peek(){
/*c  void               primitive_peek( void ) {  c*/
// Get the value of a cell, using a cell's address. This is very low level.
  copy_cell( value( TOS ), TOS );
}


/*
 *  poke primitive
 */

primitive( "inox-poke", primitive_poke );
/**/ function           primitive_poke(){
/*c  void               primitive_poke( void ) {  c*/
// Set the value of a cell, using a cell's address. Low level, unsafe.
  const address = pop_integer();
  move_cell( POP(), address );
}


/*
 *  make-constant primitive
 */

primitive( "inox-make-constant", primitive_make_constant );
/**/ function                    primitive_make_constant() : void {
/*c  void                        primitive_make_constant( void )  {  c*/
// Create a getter verb that pushes a literal onto the data stack

  // Get value, then name
  const value_cell = POP();

  // Create a verb to get the content, first get it's name
  const name_cell = POP();
  const constant_name = cell_to_text( name_cell );
  de&&mand( constant_name != "" );
  const name_id = tag( constant_name );
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

  /*de*/ if( de ){
  /*de*/   mand_eq( definition( name_id ), def );
  /*de*/   mand_eq(
  /*de*/     value( definition( name_id ) + ONE ),
  /*de*/     0x0000  // inox-return
  /*de*/   );
  /*de*/ }

}


/*
 *  tag-defined? primitive
 */

const tag_is_tag_defined = tag( "tag-defined?" );

primitive( "inox-tag-defined?", primitive_is_tag_defined );
/**/ function                   primitive_is_tag_defined() : void {
/*c  void                       primitive_is_tag_defined( void )  {  c*/
  // Return true if the verb is defined in the dictionary
  const name_cell = POP();
  const name_id = cell_to_text( name_cell );
  const exists = verb_exists( name_id );
  clear( name_cell );
  set( name_cell, type_boolean, tag_is_tag_defined, exists ? 1 : 0 );
}


/*
 *  defined? primitive
 */

const tag_is_defined = tag( "defined?" );

primitive( "inox-defined?", primitive_is_defined );
/**/ function               primitive_is_defined() : void {
/*c  void                   primitive_is_defined( void )  {  c*/
// Return true if the name is defined in the dictionary
  const name_cell = POP();
  de&&mand_tag( name_cell );
  const name_id = value( name_cell );
  const exists = verb_exists( tag_to_text( name_id ) );
  reset( name_cell );
  set( name_cell, type_boolean, tag_is_defined, exists ? 1 : 0 );
}


/*
 *  make-global primitive
 */

const tag_inox_peek = tag( "inox-peek" );
const tag_inox_poke = tag( "inox-poke" );

primitive( "inox-make-global", primitive_make_global );
/**/ function                  primitive_make_global(){
/*c  void                      primitive_make_global( void ) {  c*/
// Create two verbs, a getter and a setter

  // Create a getter verb to read the global variable like constants does
  primitive_2dup();
  primitive_make_constant();

  clear( POP() );
  const name_id = pop_tag();

  // Patch the length to avoid inlining of short verbs
  const getter_def = definition( name_id );
  de&&mand_eq( definition_length( getter_def ), 2 );
  set_definition_length( getter_def, 3 );  // ToDo: harmfull big hack?

  // Create a setter verb to write the global variable, xxx!
  const name = tag_to_text( name_id );
  const setter_name = name + "!";
  const setter_name_id = tag( setter_name );

  // Allocate space for verb header, cell address, setter and return instruction
  let setter_header = allocate_cells( 1 + 3 );

  // flags and length need an extra word, so does the ending "return"
  set( setter_header, type_integer, name_id, 1 + 1 + 1 + 1 );

  // Skip that header
  const setter_def = setter_header + 1 * ONE;

  // Use the address of the cell in the constant as the parameter for poke
  set( setter_def, type_integer, setter_name_id, getter_def )

  // Add call to primitive poke to set the value when verb runs
  init_cell( setter_def + 1 * ONE, 0, tag_inox_poke );

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


/*
 *  make-local primitive
 */

primitive( "inox-make-local", primitive_make_local );
/**/ function                 primitive_make_local(){
/*c  void                     primitive_make_local( void ) {  c*/
// Create a control variable in the control stack, with some initial value
  const n = pop_tag();
  // the return value on the top of the control stack must be preserved
  const old_csp = CSP;
  CSP += ONE;
  move_cell( old_csp, CSP );
  move_cell( POP(), old_csp );
  set_name( old_csp, n );
}


/*
 *  Call/return with local variables
 */

const tag_inox_with           = tag( "inox-with" );
const tag_inox_without        = tag( "inox-without" );
const inox_with_definition    = definition( tag_inox_with );
const inox_without_definition = definition( tag_inox_without );

primitive( "inox-with", primitive_with );
/**/ function           primitive_with(){
/*c  void               primitive_with( void ) {  c*/
// Push inox-with sentinel on control stack for inox-without to clear it
  CSP += ONE;
  set( CSP, type_integer, tag_inox_with, inox_with_definition );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_without, inox_without_definition);
}


/* ------------------------------------------------------------------------
 *  call/return with named parameters
 */

const tag_inox_return_without_parameters
= tag( "inox-return-without-parameters" );
const tag_rest  = tag( "rest" );
const tag_block = tag( "block" );

/**/ function is_block( c : Cell ) : boolean {
/*c  boolean is_block( Cell c    )           {  c*/
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

primitive(   "inox-return-without-parameters",
              primitive_return_without_parameters );
/**/ function primitive_return_without_parameters()
/*c  void     primitive_return_without_parameters( void ) {  c*/
{

  // ToDo: the limit should be the base of the control stack
  let limit : Cell;
  if( check_de ){
    limit = ACTOR_control_stack;
  }

  while( name( CSP ) != tag_inox_with ){
    clear( CSP );
    CSP -= ONE;
    if( check_de && CSP < limit ){
      FATAL( "inox-with sentinel out of reach" );
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


/*
 *  run-with-parameters primitive
 */

const tag_inox_run_with_parameters
= tag( "inox-run-with-parameters" );
const inox_return_without_parameters_definition
= definition( tag_inox_return_without_parameters );
de&&mand_neq(
  inox_return_without_parameters_definition,
  the_default_verb_definition
);


primitive( "inox-run-with-parameters", primitive_run_with_parameters );
/**/ function                          primitive_run_with_parameters(){
/*c  void                              primitive_run_with_parameters( void ) {  c*/
// Create variables in the control stack for verbs with formal parameters.
// Up to inox-with sentinel. Usage : with /a /b { xxx } inox-run-with-parameters

  // Pop block to execute
  const block = pop_block();

  let new_tos = TOS;

  // Count formal parameters up to inox-with sentinel included
  let count = 0;
  let parameter_name;
  while( true ){
    parameter_name = name( new_tos );
    count++;
    if( parameter_name == tag_rest ){
      // ToDo: special /rest parameter should make a list object with the rest
    }
    if( parameter_name == tag_inox_with )break;
    if( count > 10 ){
      bug( "Too many parameters, more then ten" );
      debugger;
      break;
    }
    new_tos -= ONE;
  }

  save_ip( tag_inox_run_with_parameters )

  // Set value of parameters using values from the data stack
  const csp = CSP;
  let copy_count = 0;
  let n : Name;

  // Go from sentinel argument back to tos, push each actual parameter
  const sentinel_tos = new_tos;
  let actual_argument_cell  = csp;
  let formal_parameter_cell = new_tos;
  let source_argument_cell  = new_tos - ( count - 1 ) * ONE;

  de&&mand_cell_name( sentinel_tos, tag_inox_with );
  de&&mand_tag( sentinel_tos );

  while( copy_count < count ){

    // Process sentinel cell, actual argument is number of formal parameters
    if( copy_count == 0 ){
      de&&mand_cell_name( formal_parameter_cell, tag_inox_with );
      set( actual_argument_cell, type_integer, tag_inox_with, count - 1 );
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
    tag_inox_return_without_parameters,
    inox_return_without_parameters_definition
  );

  // Execute the block, on return it will jump to the parameters remover
  IP = block;

}


/*
 *  local primitive
 */

primitive( "inox-local", primitive_local );
/**/ function            primitive_local(){
/*c  void                primitive_local( void ) {  c*/
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


/*
 *  set-local primitive
 */

primitive( "inox-set-local", primitive_set_local );
/**/ function                primitive_set_local(){
/*c  void                    primitive_set_local( void ) {  c*/
// Set the value of a control variable in the control stack
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


/*
 *  data primitive
 */

primitive( "inox-data", primitive_data );
/**/ function           primitive_data(){
/*c  void               primitive_data( void ) {  c*/
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


/*
 *  set-data primitive
 */

primitive( "inox-set-data", primitive_set_data );
/**/ function               primitive_set_data(){
/*c  void                   primitive_set_data( void ) {  c*/
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


/*
 *  size-of-cell primitive
 */

primitive( "inox-size-of-cell", primitive_size_of_cell );
/**/ function                   primitive_size_of_cell(){
/*c  void                       primitive_size_of_cell( void ) {  c*/
  set( PUSH(), type_integer, tag( "size-of-cell" ), size_of_cell );
}


/*
 *  Indirect access to variables, like pointers in C
 */

/**/ function cell_lookup(
/**/   start : Cell,
/**/   end   : Cell,
/**/   tag   : Tag,
/**/   nth   : Index
/**/ ) : Cell {
/*c
Cell cell_lookup(
  Cell start,
  Cell end,
  Tag  tag,
  Index nth
) {
c*/
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
 *  lookup primitive
 */

primitive( "inox-lookup", primitive_lookup );
/**/ function             primitive_lookup(){
/*c  void                 primitive_lookup( void ) {  c*/
// Get the integer address of the nth named value in a range of cells, or 0
  const nth        = pop_integer();
  const end_ptr    = pop_integer();
  const start_ptr  = pop_integer();
  const n = eat_tag( TOS );
  let found = cell_lookup( start_ptr, end_ptr, n, nth );
  set( TOS, type_integer, tag( "lookup" ), found );
}


/*
 *  upper-local primitive
 */

primitive( "inox-upper-local", primitive_upper_local );
/**/ function                  primitive_upper_local(){
/*c  void                      primitive_upper_local( void ) {  c*/
// Get the value of the nth named value inside the control stack, or void
  de&&mand_eq( type( TOS ), type_integer );
  const nth        = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  let found = cell_lookup( CSP, ACTOR_control_stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    reset( TOS )
  }
}


/*
 *  set-upper-local primitive
 */

primitive( "inox-upper-data", primitive_upper_data );
/**/ function                 primitive_upper_data(){
/*c  void                     primitive_upper_data( void ) {  c*/
// Get the value of the nth named value inside the data stack, or void
  const nth = pop_integer();
  const n   = eat_tag( TOS );
  let found = cell_lookup( TOS - ONE, ACTOR_data_stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    reset( TOS )
  }
}


/*
 *  set-upper-local primitive
 */

primitive( "inox-set-upper-local", primitive_set_upper_local );
/**/ function                      primitive_set_upper_local(){
/*c  void                          primitive_set_upper_local( void ) {  c*/
// Set the value of the nth named value inside the control stack
  const nth = pop_integer();
  const n   = pop_tag();
  let found = cell_lookup( CSP, ACTOR_control_stack, n, nth );
  if( found ){
    move_cell( POP(), found );
  }else{
    FATAL( "Control nth" + nth
    + " variable not found, named " + tag_to_text( n ) );
  }
}


/*
 *  set-upper-data primitive
 */

primitive( "inox-set-upper-data", primitive_set_upper_data );
/**/ function                     primitive_set_upper_data(){
/*c  void                         primitive_set_upper_data( void ) {  c*/
// Set the value of the nth named value inside the data stack
  const nth   = pop_integer();
  const n     = pop_tag();
  const found = cell_lookup( TOS - ONE, ACTOR_data_stack, n, nth );
  if( found ){
    move_cell( TOS, found );
  }else{
    FATAL( "Data nth" + nth
    + " variable not found, named " + tag_to_text( n ) );
  }
}


/*
 *  without-data primitive
 */

primitive( "inox-without-data", primitive_without_data );
/**/ function                   primitive_without_data(){
/*c  void                       primitive_without_data( void ) {  c*/
// Clear data stack down to the specified data variable included
  const n = pop_tag();
  while( name( TOS ) != n ){
    clear( TOS );
    TOS -= ONE;
    if( TOS < ACTOR_data_stack ){
      FATAL( "inox-data-without, missing " + tag_to_text( n ) );
      return;
    }
  }
  clear( TOS );
  TOS -= ONE;
}


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

  // Inox does handle sparse arrays
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

}


function make_object_from_js( obj : any ) : Cell {
// Build a new Inox object from a Javascript one, a deep clone.
  // Handle circular references
  let met_objects = new Map< string, any >;
  const new_cell = make_circular_object_from_js( obj, met_objects );
  // Free whatever memory the map uses
  met_objects = null;
  return new_cell;
}

/*}*/


/**/ function  object_length( header : Cell ) : Index {
/*c  Index     object_length( Cell header   )         {  c*/
// Get the number of cells of the object
  // This does not include the headers used for memory management
  // The first cell of the object contains the length, whereas the
  // it's name is the class of the object.
  const length = value( header );
  return length;
}


/*
 *  make-fixed-object primitive
 *  ToDo: make-extensible-object
 *  On extensible objects, more push and pop operations are anticipated
 *  Implmentation may detect when object is full and need to be extended.
 */

const tag_out_of_memory = tag( "out-of-memory" );

primitive( "inox-make-fixed-object", primitive_make_fixed_object );
/**/ function                        primitive_make_fixed_object(){
/*c  void                            primitive_make_fixed_object( void ) {  c*/
// Make an object from values plus header. v1 v2 ... vnn name:nn -- name:ptr
// Returns a pointer value that points to the new object in dynamic memory.
// Whenever that pointer is copied, a reference counter is incremented.
// Whenever a pointer is disposed, the counter is decremented.
// When the counter reaches zero, each member is also disposed and the
// dynamic memory to store the object is released back to the heap of
// cells.
// ToDo: make-extensible-object with an additional level of indirection?
// I could set the high bit of the length as a flog to indicate the indirection.

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
    // ToDo: raise an exception
    set( TOS, type_integer, tag_out_of_memory, 0 );
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

primitive( "inox-make-object", primitive_make_object );
/**/ function                  primitive_make_object(){
/*c  void                      primitive_make_object( void ) {  c*/
  // The length and the capacity are the same
  primitive_dup();
  // That's just a fixed object with no room for more attributes!
  primitive_make_fixed_object();
}


/*
 *  make-x-object primitive
 */

primitive( "inox-extend-object", primitive_extend_object );
/**/ function                    primitive_extend_object(){
/*c  void                        primitive_extend_object( void ) {  c*/
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
    FATAL( "out-of-memory" );
  }
  // Copy the object to the extended area
  let ii;
  for( ii = 0; ii < len; ii++ ){
    move_cell( o + ii * ONE, ptr + ii * ONE );
  }
  // Change the type of the object's content
  set( o, type_reference, name( o ), ptr );
  // Free the now unused portion of the object's area
  resize_area( o, 1 * ONE );
}


/*
 *  object-get primitive
 */

primitive( "inox-object-get", primitive_object_get );
/**/ function                 primitive_object_get(){
/*c  void                     primitive_object_get( void ) {  c*/
// Copy the value of an instance variable from an object
  const tos = POP();
  const obj = TOS;
  let ptr = value( obj );
  // ToDo: Void from void?
  if( ptr == 0x0 ){
    de&&mand( info( obj ) == 0 );
    clear( tos );
    clear( obj );
    return
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
  let limit;
  if( check_de ){
    limit = ptr + object_length( ptr ) * ONE;
  }
  // Skip the class name & length header first cell
  ptr += ONE;
  const n = name( tos );
  while( name( ptr ) != n ){
    // ToDo: go backward? That would process the array as a stack
    ptr += ONE;
    if( check_de ){
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

primitive( "inox-object-set", primitive_object_set );
/**/ function                 primitive_object_set(){
/*c void                      primitive_object_set( void ) {  c*/
  // Set the value of an instance variable, aka attribute, of an object.
  const n = pop_tag();
  check_de&&mand_cell_type( TOS, type_reference );
  const obj = POP();
  let ptr = value( obj );
  // Add an indirection level if objet is extensible
  if( type( ptr ) == type_reference ){
    ptr = get_reference( ptr );
  }
  let limit : Cell;
  if( check_de ){
    limit = ptr + object_length( ptr ) * ONE;
  }
  // Skip the class name & length header first cell
  ptr += ONE;
  // Find the cell with the desired name
  while( name( ptr ) != n ){
    // ToDo: go backward?
    ptr += ONE;
    if( check_de ){
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

primitive( "inox-stack-push", primitive_stack_push );
/**/ function                 primitive_stack_push(){
/*c void                      primitive_stack_push( void ) {  c*/
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

primitive( "inox-stack-drop", primitive_stack_drop );
/**/ function                 primitive_stack_drop(){
/*c void                      primitive_stack_drop( void ) {  c*/
  // Pop a value from the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    FATAL( "inox-stack-pop, empty stack" );
    return;
  }
  move_cell( target + length * ONE, PUSH() );
  set_value( target, length - 1 );
}


primitive( "inox-stack-drop-nice", primitive_stack_drop_nice );
/**/ function                 primitive_stack_drop_nice(){
/*c void                      primitive_stack_drop_nice( void ) {  c*/
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

primitive( "inox-stack-fetch", primitive_stack_fetch );
/**/ function                  primitive_stack_fetch(){
/*c void                       primitive_stack_fetch( void ) {  c*/
// Fetch a value from the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    FATAL( "inox-stack-fetch, empty stack" );
    return;
  }
  copy_cell( target + length * ONE, PUSH() );
}


primitive( "inox-stack-fetch-nice", primitive_stack_fetch_nice );
/**/ function                  primitive_stack_fetch_nice(){
/*c void                       primitive_stack_fetch_nice( void ) {  c*/
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

primitive( "inox-stack-length", primitive_stack_length );
/**/ function                   primitive_stack_length(){
/*c void                        primitive_stack_length( void ) {  c*/
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

primitive( "inox-stack-capacity", primitive_stack_capacity );
/**/ function                     primitive_stack_capacity(){
/*c void                          primitive_stack_capacity( void ) {  c*/
// Return the capacity of the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const size = area_size( value( target ) );
  push_integer( ( size / size_of_cell ) - 1 );
  set_tos_name( tag_stack_capacity );
}


/*
 *  stack-dup primitive
 */

primitive( "inox-stack-dup", primitive_stack_dup );
/**/ function                primitive_stack_dup(){
/*c void                     primitive_stack_dup( void ) {  c*/
// Duplicate the top of the stack of an object
  stack_dup( pop_reference() );
}


/*
 *  stack-clear primitive
 */

primitive( "inox-stack-clear", primitive_stack_clear );
/**/ function                  primitive_stack_clear(){
/*c void                       primitive_stack_clear( void ) {  c*/
// Clear the stack of an object
  stack_clear( pop_reference() );
}


/**/ function swap_cell( c1 : Cell, c2 : Cell ){
/*c void swap_cell( Cell c1, Cell c2 ) {  c*/
  let tmp = allocate_cell();
  move_cell( c1, tmp );
  move_cell( c2, c1 );
  move_cell( tmp, c2 );
  free_cell( tmp );
}


/*
 *  stack-swap primitive
 */

primitive( "inox-stack-swap", primitive_stack_swap );
/**/ function                 primitive_stack_swap(){
/*c void                      primitive_stack_swap( void ) {  c*/
// Swap the top two values of the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length < 2 ){
    FATAL( "inox-stack-swap, stack too short" );
    return;
  }
  swap_cell( target, target - 1 * ONE );
}


/*
 *  stack-swap-nice primitive
 */

primitive( "inox-stack-swap-nice", primitive_stack_swap_nice );
/**/ function                 primitive_stack_swap_nice(){
/*c void                      primitive_stack_swap_nice( void ) {  c*/
// Swap the top two values of the stack of an object, no error if stack is too short
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


primitive( "inox-stack-enter", primitive_stack_enter );
/**/ function                  primitive_stack_enter(){
/*c void                       primitive_stack_enter( void ) {  c*/
// Switch the current actor data stack with the stack of an object
  let target = pop_reference();
  if( type( target ) == type_reference ){
    target = get_reference( target );
  }
  const length = value( target );
  if( length == 0 ){
    FATAL( "inox-stack-enter, empty stack" );
    return;
  }
  CSP += ONE;
  set( CSP, type_reference, tag_stack_base, ACTOR_data_stack );
  increment_object_ref_count( ACTOR_data_stack );
  ACTOR_data_stack = target;
  CSP += ONE;
  set( CSP, type_integer, tag_stack_limit, ACTOR_data_stack_limit );
  ACTOR_data_stack_limit = target + area_size( target ) / size_of_cell;
  CSP += ONE;
  set( CSP, type_integer, tag_stack_top, TOS );
  TOS = target + length * ONE;
}


primitive( "inox-stack-leave", primitive_stack_leave );
/**/ function                  primitive_stack_leave(){
/*c void                       primitive_stack_leave( void ) {  c*/
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

primitive( "inox-data-stack-base", primitive_data_stack_base );
/**/ function                      primitive_data_stack_base(){
/*c void                           primitive_data_stack_base( void ) {  c*/
  push_integer( ACTOR_data_stack );
  set_tos_name( tag_data_stack_base );
}


/*
 *  data-stack-limit primitive
 */

primitive( "inox-data-stack-limit", primitive_data_stack_limit );
/**/ function                       primitive_data_stack_limit(){
/*c void                            primitive_data_stack_limit( void ) {  c*/
  push_integer( ACTOR_data_stack_limit );
  set_tos_name( tag_data_stack_limit );
}


/*
 *  control-stack-base primitive
 */

const tag_control_stack_base  = tag( "control-stack-base" );
const tag_control_stack_limit = tag( "control-stack-limit" );

primitive( "inox-control-stack-base", primitive_control_stack_base );
/**/ function                         primitive_control_stack_base(){
/*c void                              primitive_control_stack_base( void ) {  c*/
  push_integer( ACTOR_control_stack );
  set_tos_name( tag_control_stack_base );
}


/*
 *  control-stack-limit primitive
 */

primitive( "inox-control-stack-limit", primitive_control_stack_limit );
/**/ function                          primitive_control_stack_limit(){
/*c void                               primitive_control_stack_limit( void ) {  c*/
  push_integer( ACTOR_control_stack_limit );
  set_tos_name( tag_control_stack_limit );
}


/*
 *  grow-data-stack primitive
 */


primitive( "inox-grow-data-stack", primitive_grow_data_stack );
/**/ function                      primitive_grow_data_stack(){
/*c void                           primitive_grow_data_stack( void ) {  c*/
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
    FATAL( "inox-grow-control-stack, out of memory" );
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

primitive( "inox-grow-control-stack", primitive_grow_control_stack );
/**/ function                         primitive_grow_control_stack(){
/*c void                              primitive_grow_control_stack( void ) {  c*/
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
    FATAL( "inox-grow-control-stack, out of memory" );
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

primitive( "inox-queue-push", primitive_queue_push );
/**/ function                 primitive_queue_push(){
/*c void                      primitive_queue_push( void ) {  c*/
  primitive_stack_push();
}


/*
 *  queue-length primitive
 */

primitive( "inox-queue-length", primitive_queue_length );
/**/ function                   primitive_queue_length(){
/*c void                        primitive_queue_length( void ) {  c*/
  primitive_stack_length();
}


/*
 *  queue-pull primitive
 */

primitive( "inox-queue-pull", primitive_queue_pull );
/**/ function                 primitive_queue_pull(){
/*c void                      primitive_queue_pull( void ) {  c*/
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value( TOS );
  clear( TOS );
  POP();
  const queue_length = value( queue );
  if( queue_length + 1 >= area_size( queue ) / size_of_cell ){
    FATAL( "inox-queue-pull, queue overflow" );
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

primitive( "inox-queue-capacity", primitive_queue_capacity );
/**/ function                     primitive_queue_capacity(){
/*c void                          primitive_queue_capacity( void ) {  c*/
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value( TOS );
  clear( TOS );
  POP();
  const queue_capacity = area_size( queue ) / size_of_cell;
  push_integer( queue_capacity - 1 );
  set_tos_name( tag_queue_capacity );
}


/*
 *  queue-clear primitive
 */

primitive( "inox-queue-clear", primitive_queue_clear );
/**/ function                       primitive_queue_clear(){
/*c void                            primitive_queue_clear( void ) {  c*/
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

primitive( "inox-array-put", primitive_array_put );
/**/ function                primitive_array_put(){
/*c void                     primitive_array_put( void ) {  c*/
  const value_cell = TOS;
  const index_cell = TOS - ONE;
  check_de&&mand_integer( index_cell );
  const index = value( index_cell );
  const array_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_length = value( array );
  const array_capacity = area_size( array ) / size_of_cell;
  if( index < 0 || index >= array_capacity ){
    FATAL( "inox-array-put, index out of range" );
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


primitive( "inox-array-get", primitive_array_get );
/**/ function                primitive_array_get(){
/*c void                     primitive_array_get( void ) {  c*/
  const index_cell = TOS;
  check_de&&mand_integer( index_cell );
  const index = value( index_cell );
  const array_cell = TOS - ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_length = value( array );
  if( index < 0 || index >= array_length ){
    FATAL( "inox-array-get, index out of range" );
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

primitive( "inox-array-length", primitive_array_length );
/**/ function                   primitive_array_length(){
/*c void                        primitive_array_length( void ) {  c*/
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

primitive( "inox-array-capacity", primitive_array_capacity );
/**/ function                     primitive_array_capacity(){
/*c void                          primitive_array_capacity( void ) {  c*/
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value( array_cell );
  const array_capacity = area_size( array ) / size_of_cell;
  clear( array_cell );
  set( TOS, type_integer, tag_array_capacity, array_capacity - 1 );
}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as a map
 */

/*
 *  map-put primitive
 */

primitive( "inox-map-put", primitive_map_put );
/**/ function              primitive_map_put(){
/*c void                   primitive_map_put( void ) {  c*/
  const value_cell = TOS;
  const name_id = name( value_cell );
  const map_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value( map_cell );
  const map_length = value( map );
  const map_capacity = area_size( map ) / size_of_cell;
  // Search for the key
  let ii = 0;
  while( ii < map_length ){
    if( name( map + ( ii + 1 ) * ONE ) == name_id ){
      break;
    }
    ii++;
  }
  if( ii == map_capacity ){
    FATAL( "inox-map-put, map full" );
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

primitive( "inox-map-get", primitive_map_get );
/**/ function              primitive_map_get(){
/*c void                   primitive_map_get( void ) {  c*/
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
    FATAL( "inox-map-get, key not found" );
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

primitive( "inox-map-length", primitive_map_length );
/**/ function                 primitive_map_length(){
/*c void                      primitive_map_length( void ) {  c*/
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

primitive( "inox-without-local", primitive_without_local );
/**/ function                    primitive_without_local(){
/*c void                         primitive_without_local( void ) {  c*/
// Clear control stack down to the specified control variable included
  const n = pop_tag();
  while( name( CSP ) != n ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "inox-without, missing " + tag_to_text( n ) );
      return;
    }
  }
  clear( CSP );
  CSP -= ONE;
}


/*
 *  return-without-locals primitive
 */

primitive( "inox-return-without-locals", primitive_return_without_locals );
/**/ function                            primitive_return_without_locals(){
/*c void                                 primitive_return_without_locals( void ) {  c*/
// Return after a clear down to the local variable inox-with sentinel included
  while( name( CSP ) != tag_inox_with ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "inox-return-without-locals, /inox-with is missing" );
      return;
    }
  }
  IP = eat_integer( CSP );
  CSP -= ONE;
}


/*
 *  inox-with-locals primitive
 */

const tag_inox_return_without_locals = tag( "inox-return-without-locals" );
const tag_inox_return_without_locals_definition
= definition( tag_inox_return_without_locals );

primitive( "inox-with-locals", primitive_with_locals );
/**/ function                  primitive_with_locals(){
/*c void                       primitive_with_locals( void ) {  c*/
// Prepare for a run that may create local variables
  CSP += ONE;
  set( CSP, type_integer, tag_inox_with, IP );
  CSP += ONE;
  set( CSP, type_integer, tag_inox_with, tag_inox_return_without_locals );
}


/* ----------------------------------------------------------------------------
 *  Methods calls & other calls with the it local variable
 */

/*
 *  return-without-it primitive
 */

primitive( "inox-return-without-it", primitive_return_without_it );
/**/ function                        primitive_return_without_it(){
/*c void                             primitive_return_without_it( void ) {  c*/
// Return after a clear down to the 'it' local variable included
  while( name( CSP ) != tag_it ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "inox-without-it, 'it' is missing" );
      return;
    }
  }
  reset( CSP );
  CSP -= ONE;
  de&&mand( name( CSP ) === tag_inox_run_with_it );
  IP = eat_integer( CSP );
  CSP -= ONE;
}


/*
 *  with-it primitive
 */

const tag_inox_with_it           = tag( "inox-with-it" );
const tag_inox_return_without_it = tag( "inox-return-without-it" );
const tag_inox_return_without_it_definition
= definition( tag_inox_return_without_it );

primitive( "inox-with-it", primitive_with_it );
/**/ function              primitive_with_it(){
/*c void                   primitive_with_it( void ) {  c*/
// Prepare for a call to a block that expects an 'it' local variable

  CSP += ONE;
  set( CSP, type_integer, tag_inox_with, IP );

  CSP += ONE;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );

  // Block will return to the definition of inox-return-without-it
  CSP += ONE;
  set( CSP, type_integer, tag_inox_run_with_it,
    tag_inox_return_without_it_definition
  );

}


/*
 *  it primitive
 */

primitive( "inox-it", primitive_it );
/**/ function         primitive_it(){
/*c void              primitive_it( void ) {  c*/
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

primitive( "inox-it!", primitive_set_it );
/**/ function          primitive_set_it(){
/*c void               primitive_set_it( void ) {  c*/
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

primitive( "inox-run-method-by-name", primitive_run_method_by_name );
/**/ function                         primitive_run_method_by_name(){
/*c void                              primitive_run_method_by_name( void ) {  c*/
// Call method by name
  // ToDo: should check against a type_text
  const name_id = pop_tag();
  const name = tag_to_text( name_id );
  let target = TOS;
  const target_type = type( target );
  // ToDo: lookup using name of value ?
  let target_class_name = tag_to_text( cell_class_tag( target ) );
  const full_name = target_class_name + "." + name;
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

primitive( "inox-run-method-by-tag", primitive_run_method_by_tag );
/**/ function                        primitive_run_method_by_tag(){
/*c void                             primitive_run_method_by_tag( void ) {  c*/
// Call method by tag
  check_de&&mand_tag( TOS );
  // ToDo: should not reuse primitive as it is because it should expect a text
  primitive_run_method_by_name();
}


/*
 *  run-with-it primitive
 */

const inox_return_without_it_definition
= definition( tag_inox_return_without_it );
const tag_inox_run_with_it = tag( "inox-run-with-it" );

primitive( "inox-run-with-it", primitive_run_with_it );
/**/ function                  primitive_run_with_it(){
/*c void                       primitive_run_with_it( void ) {  c*/
// Like inox-run but with an it local variable
  const block = pop_block();
  /*de*/ if( de && block < 3000 ){
  /*de*/   FATAL( "Not a block at " + block );
  /*de*/   return;
  /*de*/ }
  // Create and initialize an it control variable in the control stack
  // Push normal return address onto control stack
  CSP += ONE;
  set( CSP, type_integer, tag_inox_run_with_it, IP );
  // Push local variable 'it'
  CSP += ONE;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );
  // Push special return address to local variables cleaner
  CSP += ONE;
  set( CSP, type_integer, tag_inox_return_without_it,
  inox_return_without_it_definition );
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

primitive( "inox-words-per-cell", primitive_words_per_cell );
/**/ function                     primitive_words_per_cell(){
/*c void                          primitive_words_per_cell( void ) {  c*/
  set( PUSH(), type_integer, tag_words_per_cell, ONE );
}


/*
 *  CSP primitive
 */

const tag_CSP = tag( "CSP" );

primitive( "inox-CSP", primitive_CSP );
/**/ function          primitive_CSP(){
  /*c void             primitive_CSP( void ) {  c*/
  set( PUSH(), type_integer, tag_CSP, CSP );
}


/*
 *  set-CSP primitive
 */

primitive( "inox-set-CSP", primitive_set_CSP );
/**/ function              primitive_set_CSP(){
/*c void                   primitive_set_CSP( void ) {  c*/
  CSP = pop_integer();
}


/*
 *  TOS primitive
 */

const tag_TOS = tag( "TOS" );

primitive( "inox-TOS", primitive_TOS );
/**/ function          primitive_TOS(){
/*c void               primitive_TOS( void ) {  c*/
  set( PUSH(), type_integer, tag_TOS, TOS );
};


/*
 *  set-TOS primitive
 */

primitive( "inox-set-TOS", primitive_set_TOS );
/**/ function              primitive_set_TOS(){
/*c void                   primitive_set_TOS( void ) {  c*/
  TOS = pop_integer()
};


/*
 *  IP primitive
 */

const tag_IP = tag( "IP" );

primitive( "inox-IP", primitive_IP );
/**/ function         primitive_IP(){
/*c void              primitive_IP( void ) {  c*/
  set( PUSH(), type_integer, tag_IP, IP );
}


/*
 *  set-IP primitive
 */

primitive( "inox-set-IP", primitive_set_IP );
/**/ function             primitive_set_IP(){
/*c void                  primitive_set_IP( void ) {  c*/
  IP = pop_integer();
}


/* -----------------------------------------------------------------------
 *  runner, fast, execute Inox verbs
 */


const type_primitive = type_void;


/**/ function get_IP(){  return IP;  }
/*c  #define  get_IP()  IP  c*/

/**/ function get_CSP(){ return CSP; }
/*c  #define  get_CSP() CSP c*/

/**/ function get_TOS(){ return TOS; }
/*c  #define  get_TOS() TOS c*/

/**/ function set_IP(  v : Cell ){ IP  = v; }
/*c  #define  set_IP( v )  IP  = v  c*/

/**/ function set_CSP( v : Cell ){ CSP = v; }
/*c  #define  set_CSP( v ) CSP = v c*/

/**/ function set_TOS( v : Cell ){ TOS = v; }
/*c  #define  set_TOS( v ) TOS = v c*/

/**/ function push(){ return TOS += ONE; }
/*c  #define  push() ( TOS += ONE ) c*/

/**/ function pop(){  return TOS -= ONE; }
/*c  #define  pop()  ( TOS -= ONE ) c*/


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
/*c void init_the_execution_context( void ) {  c*/
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

/*}*/


/**/ function SET_IP(  v ){ IP  = v; }
/*c  #define  SET_IP( v )  IP  = v  c*/
/**/ function SET_CSP( v ){ CSP = v; }
/*c  #define  SET_CSP( v ) CSP = v c*/
/**/ function SET_TOS( v ){ TOS = v; }
/*c  #define  SET_TOS( v ) TOS = v c*/


/**/ function PUSH(){
/*c  void     PUSH( void ) {  c*/
  de&&mand( TOS < ACTOR_data_stack_limit );
  return TOS += ONE;
}


de&&mand( ONE == 1 );
/**/ function POP(){
/*c  ui32      POP( void ) {  c*/
  de&&mand( TOS > ACTOR_data_stack );
  return TOS--;
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


de&&mand_eq( type_primitive, 0 );

/*!c{*/

function init_inox_execution_context(){
  // primitives have a limited access to the environment, but fast
  const inox = TheInoxExecutionContext;
  inox.ip  = /**/ function ip(){  return IP;  };
  inox.csp = /**/ function csp(){ return CSP; };
  inox.tos = /**/ function tos(){ return TOS; };
  // ToDo: gmp & tmp, global memory pointer and actor memory pointer
  // ToDo: act, current Act pointer
  inox.set_ip  = /**/ function set_ip(  v : Cell ){ IP  = v; };
  inox.set_csp = /**/ function set_csp( v : Cell ){ CSP = v; };
  inox.set_tos = /**/ function set_tos( v : Cell ){ TOS = v; };

  inox.push = /**/ function push(){
    // ToDo: check stack overflow?
    return TOS += ONE;
  };

  inox.pop = /**/ function pop(){
    // ToDo: check stack underflow?
    const x = TOS;
    TOS -= ONE;
    return x;
  }

  inox.run = RUN;
}
/*}*/


init_inox_execution_context();


/**/ function RUN(){
/*c void RUN( void ) {  c*/
// This is the one /**/ function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  de&&mand_tos_is_in_bounds();
  de&&mand( !! IP );

  let fun = no_operation;
  let i : Info;
  let t : Type;

  loop: while( true ){

    // ToDo: there should be a method to break this loop
    // There is one: set remainig_instructions_credit to 0
    // ToDo: interrupt/signal handlers shoud use that mechanism
    // if( must_stop )break;

    // ToDo: there should be a method to break this loop
    inner_loop: while( remaining_instructions_credit-- ){

      // ToDo: use an exception to exit the loop,
      // together with some primitive_exit_run()
      if( !IP )break loop;

      i = info( IP );

      if( stack_de ){
        bug( S()
          + "\nRUN IP:"
          + inox_machine_code_cell_to_text( IP )
          + stacks_dump()
        );
      }else if( run_de ){
        bug( S()
          + "\nRUN IP:"
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
          check_de&&mand_tos_is_in_bounds()
          TOS += ONE;
          copy_cell( IP, TOS );
          IP += ONE;
        }
        continue inner_loop;
      }

      // The debug mode version has plenty of checks and traces

      // Special "next" code, 0x0000, is a jump to the return address.
      if( i == 0x0000 ){
        if( run_de ){
          bug( S()
            + "run, return to " + IP
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

      // Call to a primitive, the name of the cell names it.
      // ToDo: use a type instead of tricking the void type?
      if( t == type_void /* 0 */ ){

        IP += ONE;

        // Some debug tool to detect bad control stack or IP manipulations
        let verb_id = info;
        if( run_de && i != 61 ){  // inox-quote is special

          let old_csp = CSP;
          let old_ip  = IP;

          if( get_primitive( i ) == no_operation ){
            FATAL( "Run. Primitive function not found for id " + i );
          }else{
            fun = get_primitive( i );
            fun();
          }

          if( CSP != old_csp
          && i != tag( "inox-return" )
          && i != tag( "inox-run" )
          && i != tag( "inox-if" )
          && i != tag( "inox-if-else" )
          && i != tag( "inox-if-not" )
          && i != tag( "inox-run-name" )
          && i != tag( "inox-run-tag" )
          && i != tag( "inox-run-method-by-name" )
          && i != tag( "inox-while-1" )
          && i != tag( "inox-while-2" )
          && i != tag( "inox-while-3" )
          && i != tag( "inox-until-3" )
          && i != tag( "inox-loop" )
          && i != tag( "inox-break" )
          && i != tag( "inox-with-it" )
          && i != tag( "inox-without-it" )
          && i != tag( "inox-from-local" )
          && i != tag( "inox-make-local" )
          && i != tag( "inox-without-local" )
          && i != tag( "inox-sentinel" )
          && i != tag( "inox-jump" )
          && i != tag( "inox-run-with-parameters" )
          && i != tag( "inox-return-without-parameters" )
          && i != tag( "inox-run-with-it" )
          && i != tag( "inox-return-without-it" )
          && i != tag( "inox-clear-control" )
          && i != tag( "inox-clear-data" )
          && i != tag( "inox-assert" )
          && i != tag( "inox-assert-checker" )
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
            /*de*/ de&&bug( S()
            /*de*/  + "Due to " + F( fun )
            /*de*/  + ", " + inox_machine_code_cell_to_text( old_ip )
            /*de*/ );
            debugger;
            // CSP = old_csp;
          }
          if( IP && IP != old_ip ){
            /*de*/ bug( S()
            /*de*/ + "run, IP change, was " + ( old_ip - ONE )
            /*de*/ + ", due to "
            /*de*/ + inox_machine_code_cell_to_text( old_ip - ONE )
            /*de*/ );
          }
          if( IP == 0 ){
            /*de*/ bug( S()+ "run, IP 0 due to " + F( fun ) );
            // break loop;  // That's not supposed to be a way to exit the loop
          }

        }else{
          fun = get_primitive( i );
          fun();
        }

        continue;
      }

      // Else, push literal
      check_de&&mand( TOS < ACTOR_data_stack_limit )
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

const tag_eval = tag( "inox-eval" );

/**/ function run_eval(){

  IP = definition_by_text_name( "inox-eval" );
  de&&mand( !! IP );

  // Should return to here, hence IP 0
  CSP += ONE;
  set( CSP, type_integer, tag_eval, 0 );

  // ToDo: better checks for stacks overflow and underflow
  de&&mand_tos_is_in_bounds();

  RUN();

  // ToDo: better check for stacks overflow and underflow
  de&&mand_tos_is_in_bounds();

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

// Typescript version uses a Map of Map objects
/*!c{*/

// Each dialect has a map of alias to text.
let the_current_style_aliases = new Map< text, text >();
const all_aliases_by_style = new Map< text, Map< text, text > >();


/**/ function define_alias( style : text, alias : text, new_text : text ){
/*c  void     define_alias( string style, string alias, string new_text ){  c*/
// Set the definition of an alias inside a dialect/style.
  let aliases = aliases_by_style( style );
  aliases.set( alias, new_text );
}


/**/ function alias( a : text ){
/*c  string   alias( string a ){  c*/
// Get the potential aliased text for an alias in the durrent dialect/style.
  if( !  the_current_style_aliases.has( a ) )return null;
  return the_current_style_aliases.get( a );
}


/**/ function set_alias_style( style : text ) : void {
/*c  void     set_alias_style( string style ){  c*/
  the_current_style_aliases = aliases_by_style( style );
}


/**/ function aliases_by_style( style : text ) : Map< text, text > {
/*c  Map< string, string > aliases_by_style( string style ){  c*/
  if( ! all_aliases_by_style.has( style ) ){
    // On the fly style creation
    return make_style( style );
  }
  return all_aliases_by_style.get( style );
}


/**/ function make_style( style : text ) : Map< text, text > {
/*c  Map< string, string > make_style_aliases( string style ){  c*/
// Add a new dialect/style, named.
  let new_map = new Map< text, text >();
  all_aliases_by_style.set( style, new_map );
  return new_map;
}


// C++ version uses fixed size stack from stack_allocate()
/*}{

Cell the_current_style_aliases;

// Each dialect has a map of alias to text
// ToDo: 10 is arbitrary, should be dynamic
Cell all_aliases_by_style = stack_allocate( 10 );


Cell make_style( std::string style ){
  Cell new_map = stack_allocate( 100 );
  Tag  new_tag = tag( style );
  Cell tmp = allocate_cell();
  set( tmp, type_integer, new_tag, new_map );
  // ToDo: should reallocate stack if full
  stack_push( all_aliases_by_style, tmp );
  free_cell( tmp );
  return new_map;
}


Cell aliases_by_style( std::string style ){
  Tag style_tag = tag( style );
  if( !stack_contains_tag( all_aliases_by_style, style_tag ) ){
    make_style( style );
  }
  return stack_lookup_by_tag( all_aliases_by_style, style_tag );
}


void set_alias_style( std::string style ){
  the_current_style_aliases = aliases_by_style( style );
}


void define_alias( std::string style, std::string alias, std::string new_text ){
  Cell aliases = aliases_by_style( style );
  Tag  alias_tag = tag( alias );
  if( !stack_contains_tag( aliases, alias_tag ) ){
    // ToDo: should reallocate stack if full
    Cell tmp = allocate_cell();
    set( tmp, type_text, alias_tag, (Cell) new_text ) );
    stack_push( aliases, tmp );
    free_cell( tmp );
    return;
  }
  Cell alias_cell = stack_lookup_by_tag( aliases, alias_tag );
  free( value( alias_cell ) );
  set_value( alias_cell, (Cell) new_text );
}


std::string alias( std::string a ){
  if( !stack_contains_tag( the_current_style_aliases, tag( a ) ) )return NULL;
  return value( stack_lookup_by_tag( the_current_style_aliases, tag( a ) ) );
}

}*/


// Some predefined dialects/styles
let inox_style         = make_style( "inox"       );
let forth_aliases      = make_style( "forth"      );
let sh_aliases         = make_style( "sh"         );
let c_aliases          = make_style( "c"          );
let javascript_aliases = make_style( "javascript" );
let lisp_aliases       = make_style( "lisp"       );


/*
 *  inox-dialect primitive
 */

primitive( "inox-inox-dialect", primitive_inox_dialect );
/**/ function                   primitive_inox_dialect(){
/*c  void                       primitive_inox_dialect( void ){  c*/
  set_style( "inox" );
}


/*
 *  current-dialect primitive
 */

primitive( "inox-current-dialect", primitive_current_dialect );
/**/ function                      primitive_current_dialect(){
/*c  void                          primitive_current_dialect( void ){  c*/
  push_text( style );
  set_tos_name( tag( "dialect" ) );
}


/*
 *  forth-dialect primitive
 */

primitive( "inox-forth-dialect", primitive_forth_dialect );
/**/ function                    primitive_forth_dialect(){
/*c  void                        primitive_forth_dialect( void ){  c*/
  set_style( "forth" );
}


/*
 *  dialect primitive
 */

primitive( "inox-dialect", primitive_dialect );
/**/ function              primitive_dialect(){
/*c  void                  primitive_dialect( void ){  c*/
  set_style( pop_as_text() );
}


/*
 *  alias primitive
 */

primitive( "inox-alias", primitive_alias );
/**/ function            primitive_alias(){
/*c  void                primitive_alias( void ){  c*/
// Add an alias to the current style/dialect
  const new_text = pop_as_text();
  const old_text = pop_as_text();
  define_alias( style, old_text, new_text );
}


/*
 *  dialect-alias primitive
 */

primitive( "inox-dialect-alias", primitive_dialect_alias );
/**/ function                    primitive_dialect_alias(){
/*c  void                        primitive_dialect_alias( void ){  c*/
// Add an alias to a style/dialect, eg "to" "To" "inox" --
  const style    = pop_as_text();
  const new_text = pop_as_text();
  const old_text = pop_as_text();
  define_alias( style, old_text, new_text)
}


/* ----------------------------------------------------------------------------
 *  verb and block compilation related.
 */

// In that mode, Inox source code evaluator treats all verbs as if immediate.
let immediate_mode_level : Index = 0;

// This is the id of the verb beeing defined or last defined
let the_last_defined_verb : Index = 0;

let the_last_quoted_verb_id    : Index = 0;

// Last tokenized verb from the tokenizer. ToDo: usedit
const the_last_token_cell = allocate_cell();
set_integer_cell( the_last_token_cell, 0 );
set_name(         the_last_token_cell, tag( "last-token" ) );


immediate_primitive( "inox{", primitive_enter_immediate_mode );
/**/ function                 primitive_enter_immediate_mode(){
/*c  void                     primitive_enter_immediate_mode( void ){  c*/
  immediate_mode_level++;
}


immediate_primitive( "}inox", primitive_leave_immediate_mode );
/**/ function                 primitive_leave_immediate_mode(){
/*c  void                     primitive_leave_immediate_mode( void ){  c*/
  de&&mand( !! immediate_mode_level );
  immediate_mode_level--;
}


primitive( "inox-literal", primitive_literal );
/**/ function              primitive_literal(){
/*c  void                  primitive_literal( void ){  c*/
// Add a literal to the Inox verb beeing defined or to a block
  eval_do_literal();
}


primitive( "inox-machine-code", primitive_do_machine_code );
/**/ function                   primitive_do_machine_code(){
/*c  void                       primitive_do_machine_code( void ){  c*/
// Add an Inox verb code id to the Inox verb beeing defined or to a block
  eval_do_machine_code( pop_verb() );
}


primitive( "inox", primitive_inox );
/**/ function      primitive_inox(){
/*c  void          primitive_inox( void ){  c*/
// Read the next token from the source code input stream
// and get it's Inox verb code id. Defaults to 0 if next token in source
// is not a defined Inox verb.
// ToDo: could return a text instead of 0.
  eval_quote_next_token();
}


primitive( "inox-quote", primitive_quote );
/**/ function            primitive_quote(){
/*c  void                primitive_quote( void ){  c*/
// Get the next verb from the currently executing verb and skip it
  // MUST BE INLINED
  const ip = IP;
  let verb_id = name( ip );
  the_last_quoted_verb_id = verb_id;
  PUSH();
  set( TOS, type_verb, verb_id, verb_id );
  // Skip the quoted verb
  IP = ip + ONE;
}


/* -----------------------------------------------------------------------------
 *  Primitives to change the flags attached to a verb.
 */


primitive( "inox-immediate", primitive_immediate );
/**/ function                primitive_immediate(){
/*c  void                    primitive_immediate( void ){  c*/
  set_verb_immediate_flag( the_last_defined_verb );
}


primitive( "inox-hidden", primitive_hidden );
/**/ function             primitive_hidden(){
/*c  void                 primitive_hidden( void ){  c*/
  set_verb_hidden_flag( the_last_defined_verb );
}


primitive( "inox-operator", primitive_operator );
/**/ function               primitive_operator(){
/*c  void                   primitive_operator( void ){  c*/
  set_verb_operator_flag( the_last_defined_verb );
}


primitive( "inox-inline", primitive_inline );
/**/ function             primitive_inline(){
/*c  void                 primitive_inline( void ){  c*/
  set_inline_verb_flag( the_last_defined_verb );
}


primitive( "inox-last-token", primitive_last_token );
/**/ function                 primitive_last_token(){
/*c  void                     primitive_last_token( void ){  c*/
  copy_cell( the_last_token_cell, PUSH() );
}


/* -------------------------------------------------------------------------
 *  ip manipulation
 */

primitive( "inox-tag", primitive_tag );
/**/ function          primitive_tag(){
/*c  void              primitive_tag( void ){  c*/
// Make a tag, from a text typically
  const t = tag( cell_to_text( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_tag, t );
}


/**/ function run_verb( verb_id : Index ){
/*c  void     run_verb( Index verb_id   ){  c*/

  // Push return address onto control stack
  save_ip( verb_id );

  // Jump to verb definition
  IP = definition( verb_id );

}


primitive( "inox-run-tag", primitive_run_tag );
/**/ function              primitive_run_tag(){
/*c  void                  primitive_run_tag( void ){  c*/
// Call verb by tag
  run_verb( pop_tag() );
}


primitive( "inox-run-name", primitive_run_name );
/**/ function               primitive_run_name(){
/*c  void                   primitive_run_name( void ){  c*/
// Call verb by text name
  const tos = TOS;
  de&&mand_cell_type( tos, type_text );
  const name = cell_to_text( tos );
  clear( POP() );
  // ToDo: should check tag existence first
  de&&mand( tag_exists( name ) );
  let verb_id = tag( name );
  run_verb( verb_id );
}


primitive( "inox-run-verb", primitive_run_verb );
/**/ function               primitive_run_verb(){
/*c  void                   primitive_run_verb( void ){  c*/
  de&&mand_cell_type( TOS, type_verb );
  const verb_id = value( TOS );
  reset( TOS );
  run_verb( verb_id );
}


primitive( "inox-definition", primitive_definition );
/**/ function                 primitive_definition(){
/*c  void                     primitive_definition( void ){  c*/
// Get the address of the first element of the definition of a verb
  const name = cell_to_text( TOS );
  clear( TOS );
  let verb_id;
  if( tag_exists( name ) ){
    verb_id = tag( name );
  }else{
    verb_id = 0;
  }
  const ip = definition( verb_id );
  set( TOS, type_integer, tag_inox_block, ip );
  de&&mand_block( TOS );
}

// ToDo: inox-block-length & inox-verb-flags


const tag_inox_run = tag( "inox-run" );


primitive( "inox-run", primitive_run );
/**/ function          primitive_run(){
/*c  void              primitive_run( void ){  c*/
// run block on TOS
  const block = pop_block();
  /*de*/ if( de && block < 2000 ){
  /*de*/   FATAL( "Not a block at " + block );
  /*de*/   return;
  /*de*/ }
  // Push return address onto control stack
  check_de&&mand( CSP < ACTOR_control_stack_limit )
  CSP += ONE;
  set( CSP, type_integer, tag_inox_run, IP );
  // Jump into definition
  IP = block;
}


primitive( "inox-run-definition", primitive_run_definition );
/**/ function                     primitive_run_definition(){
/*c  void                         primitive_run_definition( void ){  c*/
  // "inox Hello inox-run" does what Hello does alone
  IP = definition( pop_integer() );
}


/**/ function block_length( ip : Cell ){
/*c  Cell     block_length( Cell ip   ){  c*/
// Get the length of the block at ip.
  check_de&&mand_eq( name( ip ), tag_inox_block );
  const block_length = value( ip ) & 0xffff;
  return block_length;
}


/**/ function block_flags( ip : Index ){
/*c  Index    block_flags( Index ip   ){  c*/
// Get the flags of the block at ip.
  check_de&&mand_eq( name( ip ), tag_inox_block );
  const block_flags = value( ip ) >> 16;
  return block_flags;
}


primitive( "inox-block", primitive_block );
/**/ function            primitive_block(){
/*c  void                primitive_block( void ){  c*/
// Skip block code after IP but push it's address. Ready for inox-run

  const ip = IP;
  check_de&&mand_integer(  ip );
  check_de&&mand_cell_name(  ip, tag_inox_block );
  let length = block_length( ip );
  // If block is actually the block of a verb then it is stored elsewhere
  /*de*/ if( de && is_block_ip( ip ) ){
  /*de*/   de&&mand_neq( length, 0 );
  /*de*/ }
  /*de*/ if( de ){
  /*de*/   mand( length != 0 || !is_block_ip( ip ) );
  /*de*/   // For debugging purpose I store the block's ip somewhere
  /*de*/   // Skip the block length header
  /*de*/   PUSH();
  /*de*/   set( TOS, type_integer, tag_block, ip + 1 * ONE );
  /*de*/ }else{
    const new_tos = PUSH();
    de&&mand_eq( value( TOS ), 0 );
    // Skip the block length header
    set_value( TOS, ip + 1 * ONE );
  /*de*/ }
  const new_ip = ip + ( 1 + length ) * ONE;
  /*de*/ if( de ){
  /*de*/   // There should be a return opcode at the end of the block
  /*de*/   const previous_cell = new_ip - ONE;
  /*de*/   const previous_cell_value = value( previous_cell );
  /*de*/   const previous_cell_type  = type( previous_cell );
  /*de*/   const previous_cell_name  = name( previous_cell );
  /*de*/   de&&mand_eq( previous_cell_value, 0 );
  /*de*/   de&&mand_eq( previous_cell_type, type_void );
  /*de*/   de&&mand_eq( previous_cell_name, 0x0 ); // tag_inox_return );
  /*de*/   //if( previous_cell_name != tag( "void" ) ){
  /*de*/   //  bug( S()+ "Bad opcode, not void, " + tag_to_text( previous_cell_name))
  /*de*/   //}
  /*de*/   //de&&mand_eq( previous_cell_name, tag( "void" ) );
  /*de*/ }
  IP = new_ip;
}


/* -----------------------------------------------------------------------
 *  Tokenizer
 */


/*
 *  types of tokens & of tokenizer states
 */

/**/ const token_base               = 0;
/*c  #define token_base               0  c*/
/**/ const token_type_word          = 1;
/*c  #define token_type_word          1  c*/
/**/ const token_type_number        = 2;
/*c  #define token_type_number        2  c*/
/**/ const token_type_text          = 3;
/*c  #define token_type_text          3  c*/
/**/ const token_type_comment       = 4;
/*c  #define token_type_comment       4  c*/
/**/ const token_comment_multiline  = 5;
/*c  #define token_comment_multiline  5  c*/
/**/ const token_type_eof           = 6;
/*c  #define token_type_eof           6  c*/
/**/ const token_type_indent        = 7;
/*c  #define token_type_indent        7  c*/
/**/ const token_type_error         = 8;
/*c  #define token_type_error         8  c*/


/**/ function token_type_to_text( type : number ) : text {
/*c  text     token_type_to_text( number type   ){  c*/
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


/**/ function token_type_to_tag( type : number ) : Tag {
/*c  Tag      token_type_to_tag( number type   )       {  c*/
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


/**/ function token_tag_to_type( t : Tag ) : number {
/*c  int      token_tag_to_type( Tag t )            {  c*/
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
  abstract next() : string;
}

/*}*/


// When REPL, source code comes from some readline() function
/**/ let toker_stream  : TextStreamIterator;

// Source that is beeing tokenized
/**/ let toker_text = "";
/*c  std::string toker_text( "" );  c*/

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
let toker_eager_mode : boolean = false;

// One token ahead sometime, see unget_token()
let back_token_type = 0;

// The text value of that back token
/**/ let back_token_text = "";
/*c  std::string toker_back_token_value( "" );  c*/

// ToDo: about xxxx:name stuff, weird, explain
/**/ let toker_post_literal_name = "";
/*c  std::string toker_post_literal_name( "" );  c*/

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
/*c  std::string token_value( "" );  c*/

// The position of that token in the source
let token_position = 0;

// The line number of that token in the source
let token_line_no = 0;

// The column number of that token in the source
let token_column_no = 0;

// Name of current style, "inox" or "forth" typically
/**/ let style = "";
/*c  std::string style( "" );  c*/

// "to" when Inox style, "," when Forth style
/**/ let define = "";
/*c  std::string define( "" );  c*/

// "." when Inox style, ";" when Forth style
/**/ let end_define = "";
/*c  std::string end_define( "" );  c*/

// For keyword, ";" when Inox style
/**/ let terminator_sign = ";";
/*c  std::string terminator_sign( ";" );  c*/

// Experimental Inox literate style
let is_literate = false;

// Comment detection related

// "~~" when Inox style
/**/ let comment_monoline = "";
/*c  std::string comment_monoline( "" );  c*/

// First ch of comment_monoline
/**/ let comment_monoline_ch0 = "";
/*c  char comment_monoline_ch0 = 0;  c*/

// "~|" when Inox style
/**/ let comment_multiline_begin = "";
/*c  std::string comment_multiline_begin( "" );  c*/

// "|~" when Inox style
/**/ let comment_multiline_end = "";
/*c  std::string comment_multiline_end( "" );  c*/

// First ch of comment_multiline_begin
/**/ let comment_multiline_ch0 = "";
/*c  char comment_multiline_ch0 = 0;  c*/

// Last ch of comment_multiline_end
/**/ let comment_multine_last_ch  = "";
/*c  char comment_multine_last_ch = 0;  c*/

// For style/dialect auto detection
let first_comment_seen = false;


/**/ function set_comment_mono_line( begin : text ) : void {
/*c void      set_comment_mono_line( std::string begin ) {  c*/
  comment_monoline = begin;
  comment_monoline_ch0 = begin ? begin[ 0 ] : no_text;
  set_comment_multi_line( no_text, no_text );
}

/**/ function set_comment_multi_line( begin : text, end : text ) : void {
/*c void      set_comment_multi_line( std::string begin, std::string end ) {  c*/
  comment_multiline_begin = begin;
  comment_multiline_ch0 = begin ? begin[ 0 ] : no_text;
  comment_multiline_end = end;
  comment_multine_last_ch = end ? end[ tlen( end ) - 1 ] : no_text;
}


/**/ function set_style( new_style : text ) : void {
/*c  void     set_style( std::string new_style  )        {  c*/
// Set the new style for future tokens detections

  set_alias_style( new_style );

  if( teq( new_style, "inox" ) ){
    set_comment_mono_line( "~~" );
    set_comment_multi_line( "~|", "|~" );
    // Using "to" is Logo style, it's turtles all the way down
    define = "to";
    end_define = ".";

  }else if( teq( new_style, "c" )
  ||        teq( new_style, "javascript" )
  ){
    set_comment_mono_line( "//" );
    set_comment_multi_line( "/*", "*/" );
    if( teq( new_style, "javascript" ) ){
      define = "function";
      end_define = "}";
    }

  }else if( teq( new_style, "sh" ) ){
    set_comment_mono_line( "#" );
    // There is no standard, let's invent something
    set_comment_multi_line( "<<____", "____" );
    define = "function";
    end_define = "}";

  }else if( teq( new_style, "forth" ) ){
    set_comment_mono_line( "\\" );
    set_comment_multi_line( "(", ")" );
    define = ":";
    end_define = ";";

  }else if( teq( new_style, "lisp" ) ){
    set_comment_mono_line( ";" );
    set_comment_multi_line( "#|", "|#" );
    define = "defn";
    end_define = ")"; // ToDo: this probably doesn't work

  }else if( teq( new_style, "prolog" ) ){
    set_comment_mono_line( "%" );
    set_comment_multi_line( "/*", "*/" );
    define = "clause";
    end_define = ".";
  }

  style = new_style;

  // Don't guess the style because user made it explicit
  first_comment_seen = true;

}


/**/ function tokenizer_set_literate_style( is_it : boolean ) : void {
/*c  void     tokenizer_set_literate_style( bool is_literate ) {  c*/
  is_literate = is_it;
}


/**/ function tokenizer_set_stream( s : TextStreamIterator ){
/*c  void     tokenizer_set_stream( TextStreamIterator stream ) {  c*/
  /**/ toker_stream = s;
}


/**/ function tokenizer_restart( source : text ){
/*c  void     tokenizer_restart( string source ) {  c*/

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


primitive( "inox-start-input", primitive_inox_start_input );
/**/ function                  primitive_inox_start_input(){
/*c  void                      primitive_inox_start_input( void ){ c*/
  tokenizer_restart( cell_to_text( TOS ) );
  clear( POP() );
}


primitive( "inox-input", primitive_inox_input );
/**/ function            primitive_inox_input(){
/*c  void                primitive_inox_input( void ){ c*/
  // Get next character in source code, or void
  push_text( tokenizer_next_character() );
}


const tag_token = tag( "token" );


primitive( "inox-input-until", primitive_input_until );
/**/ function                  primitive_input_until(){
/*c  void                      primitive_input_until( void ){ c*/
  const tos = TOS;
  let limit = cell_to_text( tos );
  clear( tos );
  let buf = "";
  let ch : text ;
  while( true ){
    ch = tokenizer_next_character();
    if( teq( ch, "" ) && tneq( limit, "" ) ){
      // Return void if source is empty
      clear( tos );
      return;
    }
    if( ch == limit ){
      set_text_cell( tos, buf );
      set_name( tos, tag_token );
      return;
    }
    buf += ch;
  }
}


/**/ function unget_token( t : Index, s : string ) : void {
/*c  void     unget_token( int t, std::string s ) {  c*/
  back_token_type = token_type_word;
  back_token_text = s;
}


primitive( "inox-pushback-token", primitive_pushback_token );
/**/ function                     primitive_pushback_token(){
/*c  void                         primitive_pushback_token( void ){ c*/
  const cell = POP();
  const n = name( cell );
  // ToDo: should handle the token type properly
  const typ = token_tag_to_type( n );
  unget_token( typ, cell_to_text( cell ) );
  clear( cell );
}


/**/ function ch_is_space( ch : text ){
/*c  boolean  ch_is_space( std::string ch  ){ c*/
  return teq( ch, "\n" )
  ||     teq( ch, "\r" )
  ||     teq( ch, "\t" )
  ||     teq( ch, " " );
}


/*
 *  whitespace? primitive
 */

const tag_is_whitespace = tag( "whitespace?" );


primitive( "inox-whitespace?", primitive_inox_is_whitespace );
/**/ function                  primitive_inox_is_whitespace(){
/*c  void                      primitive_inox_is_whitespace( void ){ c*/
// True if the top of stack is a whitespace character
  de&&mand_cell_type( TOS, type_text );
  const text = cell_to_text( TOS );
  clear( POP() );
  push_boolean( ch_is_space( text ) );
  set_tos_name( tag_is_whitespace );
}


/*
 *  inox-next-token-character primitive
 */

const tag_inox_next_token_character = tag( "inox-next-token-character" );


primitive( "inox-next-token-character", primitive_next_token_character );
/**/ function                           primitive_next_token_character(){
/*c  void                               primitive_next_token_character( void ){ c*/
// Get next character in source code, or void
  const ch = tokenizer_next_character();
  push_text( ch );
  set_tos_name( tag_inox_next_token_character );
}


/**/ function tokenizer_next_character() : text {
/*c  text     tokenizer_next_character( void )  { c*/
// Get/consume next character and advance cursor, or ""
  // ToDo: handle stream?
  if( toker_text_cursor >= toker_text_length )return "";
  const ch = toker_text[ toker_text_cursor++ ];
  return ch;
}


/*
 *  inox-digit? primitive
 */

const tag_inox_is_digit = tag( "inox-digit?" );

primitive( "inox-digit?", primitive_is_digit );
/**/ function             primitive_is_digit(){
/*c  void                 primitive_is_digit( void ){ c*/
  de&&mand_cell_type( TOS, type_text );
  const text = cell_to_text( TOS );
  clear( POP() );
  push_boolean( ch_is_digit( text ) );
  set_tos_name( tag_inox_is_digit );
}


/**/ function ch_is_digit( ch : text ){
/*c  boolean  ch_is_digit( text ch   ){ c*/
  // ToDo: avoid regexp
  return /\d/.test( ch.charAt( 0 ) );
}


/*
 *  inox-eol? primitive
 */

const tag_inox_is_eol = tag( "inox-eol?" );


primitive( "inox-eol?", primitive_inox_is_eol );
/**/ function           primitive_inox_is_eol(){
/*c  void               primitive_inox_is_eol( void ){ c*/
  de&&mand_cell_type( TOS, type_text );
  /**/ const t = cell_to_text( TOS );
  /*c  std::string t = cell_to_text( TOS ); c*/
  clear( POP() );
  push_boolean( ch_is_eol( t ) );
  set_tos_name( tag_inox_is_eol );
}


/**/ function ch_is_eol( ch : text ){
/*c  boolean  ch_is_eol( std::string ch ){ c*/
  // ToDo: handle crlf better
  if( tneq( ch, "\n" ) && tneq( ch, "\r" ) )return false;
  return true;
}


/*
 *  inox-next-token primitive
 */

const tag_word_token              = tag( "word-token"               );
const tag_number_token            = tag( "number-token"             );
const tag_text_token              = tag( "text-token"               );
const tag_comment_token           = tag( "comment-token"            );
const tag_multiline_comment_token = tag( "multiline-comment-token"  );
const tag_eof_token               = tag( "eof-token"                );
const tag_indentation_token       = tag( "indentation-token"        );
const tag_error_token             = tag( "error-token"              );


primitive( "inox-next-token", primitive_next_token );
/**/ function                 primitive_next_token(){
/*c  void                     primitive_next_token( void ){ c*/
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


/**/ function extract_line( text : string, ii : Index ){
/*c  std::string extract_line( std::string& text, int ii ){ c*/
// Extract the line surrounding the position ii in text
  // Handle negative indices
  if( ii < 0 ){
    ii = tlen( text ) + ii;
  }
  // Extract the line containing the token.
  /**/ let line_extract = "";
  /*c  std::string line_extract( "" ); c*/
  // Cut whatever is after next eol
  /**/ let part = tbut( text, ii );
  /*c  std::string part = tbut( text, ii ); c*/
  let index = tidx( part, "\n" );
  if( index != -1 ){
    line_extract = tcut( part, index );
  }else{
    line_extract = part;
  }
  // Add whatever is before, up to previous eol
  part = tcut( text, ii );
  index = tidxr( part, "\n" );
  if( index != -1 ){
    line_extract = tbut( part, index + 1 )
    + "[TOKEN]"
    + line_extract;
  }else{
    line_extract = S()+ "[TOKEN]" + line_extract;
  }
  if( tlen( line_extract ) > 70 ){
    line_extract = tcut( line_extract, 77 ) + "...";
  }
  return line_extract;
}


/**/ function next_token() : void {
/*c  Token*   next_token( void )   {  c*/
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
  let ii = toker_text_cursor;

  // Where the new token starts
  let start_ii = ii;

  // Current token, defaults to a token_word type of token
  token_type      = token_type_word;
  token_text     = "";
  token_position  = start_ii;
  token_line_no   = toker_line_no;
  token_column_no = toker_column_no;

  let state = first_comment_seen ? token_base : token_type_comment;

  // Buffer to collect token text
  let buf = "";

  // One character at a time
  let ch       = "";
  let is_space = false;
  let is_eol   = false;
  let is_eof   = false;

  // Space is the normal deliminator between words, there are special cases
  let is_limit = false;

  // Some small lookahead to detect some constructs
  // ToDo: use a "    " fixed size text?
  let next_ch  = [ " ", " ", " ", " " ];
  let next_ch_ii = 0;

  /**/ function ch_is_limit( ch : text, next_ch : text ){
    if( teq( ch, " " ) )return true;
    if( toker_eager_mode )return false;
    if( tneq( style, "inox" ) )return false;
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

  /**/ function refill_next_ch(){
    // Don't do it twice if same location
    if( next_ch_ii == ii )return;
    let jj;
    for( jj = 0 ; jj < 4 ; jj++ ){
      if( ( ii + jj ) >= toker_text_length ){
        next_ch[ jj ] = " ";
      }else{
        next_ch[ jj ] = toker_text[ ii + jj ];
        // Treat lf like a space
        if( ch_is_eol( next_ch[ jj ] ) ){
          next_ch[ jj ] = " ";
        }
      }
    }
    next_ch_ii = ii;
  }

  /**/ function handle_literate_style(){

    // See https://github.com/cognate-lang/cognate

    // ToDo: this assert fails, why? de&&mand( buf.length > 0 );

    if( !is_literate )return;
    if( teq( buf, "." ) )debugger;

    // If word does not depend on case, leave it alone, not a comment
    if( teq( buf.toLowerCase(), buf.toUpperCase() ) )return;

    // If the word is one letter long then it's a comment
    if( tlen( buf ) < 2 ){
      token_type = token_type_comment;
      return;
    }

    // In literate style, lower/upper case is significant on first 2 letters
    const first_ch  = buf[ 0 ];
    const second_ch = buf[ 1 ];

    // If word starts with two lower case letters, then it is a comment
    if( teq( first_ch.toLowerCase(), first_ch )
    &&  teq( second_ch.toLowerCase(), second_ch )
    ){
      token_type = token_type_comment;
      return;
    }

    // If word starts with 2 upper case letters, then it is code, as is
    if( teq( first_ch.toUpperCase(),  first_ch )
    &&  teq( second_ch.toUpperCase(), second_ch )
    ){
      return;
    }

    // It's code, but change uppercase first letter to lower case
    if( teq( first_ch.toUpperCase(), first_ch ) ){
      buf = first_ch.toLowerCase() + tbut( buf, 1 );
      return;
    }

    // It's code, leave it alone
    return;

  }

  let front_spaces = 0;

  let previous_ii    = 0;
  let previous_state = token_type_error;

  const is_forth = teq( style, "forth" );

  let token_is_ready = false;

  /**/ function process_whitespaces(){

    // EOF, end of file
    if( ii == toker_text_length ){
      // If there is a stream, try to get more text from it
      if( toker_stream ){
        const more_text = toker_stream.next();
        if( more_text != "" ){
          toker_text = more_text;
          toker_text_length = tlen( more_text );
          ch = more_text[ 0 ];
          ii = 1;
          previous_ii = 0;
        }else{
          is_eof = true;
        }
      }else{
        is_eof = true;
      }
      if( is_eof && state != token_type_word && state != token_type_comment ){
        token_type = token_type_eof;
        token_is_ready = true;
        return;
      }
      // Simulate a space to end the current word
      ch = " ";

    // Get next character in source
    }else{
      ch = toker_text[ ii++ ];
    }

    // Is it some space or something equivalent?
    is_space = ch_is_space( ch );
    is_eol   = ch_is_eol(   ch );

    // Normalize all whitespaces into a single space character
    if( is_space && state != token_type_comment && state != token_type_text ){
      ch = " ";
    }

    // If end of line, detect it
    if( is_eol ){
      // Line numbering, don't double when \r\n
      if( ch != "\r" ){
        toker_line_no++;
      }
      // Restart indentation detection
      front_spaces = 0;
      toker_indentation_reached = false;
      // Process eol as if it were a space
      ch = " ";
      is_space = true;

    // Count front spaces on new line to detect changed indentation
    }else if( ! toker_indentation_reached ){
      if( is_space ){
        front_spaces++;
      // If first non space on new line, emit some indentation token
      }else{
        toker_indentation_reached = true;
        // Emit either "++", "--" or "==" indentation token
        if( state == token_base ){
          token_type = token_type_indent;
          if( front_spaces > toker_indentation ){
            token_text = "++"
          }else if( front_spaces < toker_indentation ){
            token_text = "--"
          }else{
            token_text = "==";
          }
          token_column_no = front_spaces;
          toker_previous_indentation = toker_indentation;
          toker_indentation = front_spaces;
          toker_column_no = front_spaces; // ToDo: needs updates
          // Make sure first non space is processed normally next time
          ii--
          token_is_ready = true;
        }
      }
    }
  } // process_whitespaces()


  /**/ function process_base_state(){

    // skip whitespaces, including separators
    // ToDo: handle separator sign ("," if Inox) with more semantic
    if( is_space ){
      return;
    }

    // Texts start with ", unless Forth
    // ToDo: make it configurable?
    if( teq( ch, "\"" ) && !is_forth ){
      // ToDo: handle single quote 'xx' and backquote `xxxx`
      // ToDo: handle template text literals, ie fmt"..."
      start_ii = ii;
      state = token_type_text;
      return;
    }

    // Comments start differently depending on style
    buf += ch;
    de&&mand( tlen( buf ) > 0 );

    // If literate style, a line starting without indentation is a comment
    if( is_literate
    &&  toker_indentation_reached
    &&  toker_indentation == 0
    ){
      state = token_type_comment;
      // The new ch will be added when processing the comment state
      buf = tcut( buf, -1 );
      start_ii = ii;
      state = token_type_comment;
      process_comment_state();
      return;
    }

    // If actual start of comment, change state
    if( teq( buf, comment_monoline )
    ||  teq( buf, comment_multiline_begin )
    ){
      // The new ch will be added when processing the comment state
      buf = tcut( buf, -1 );
      start_ii = ii;
      state = token_type_comment;
      process_comment_state();
      return;
    }

    // If potential start of comment, keep eating
    if( teq( buf, comment_monoline_ch0 )
    ||  teq( buf, comment_multiline_ch0 )
    ){
      return;
    }

    // Clear buf but keep the false start of comment if any
    if( teq( buf[0], comment_monoline_ch0 )
    ||  teq( buf[0], comment_multiline_ch0 )
    ){
      buf = tcut( buf, -1 );
    }else{
      buf = "";
    }

    // If not a comment nor a text then it has to be a word
    start_ii = ii;
    state = token_type_word;
    process_word_state();

  } // process_base_state()


  /**/ function process_comment_state() {

    buf += ch;

    // When inside the first comment at the very beginning of the file
    // Different programming language have different styles
    // Icon uses literate programming with code lines started using >
    // See https://en.wikipedia.org/wiki/Comment_(computer_programming)

    if( ! first_comment_seen && !is_space ){

      // ToDo: skip #! shebang
      // see https://en.wikipedia.org/wiki/Shebang_(Unix)

      // Inox style of comments, ~~ and ~| xxx |~
      if( teq( ch, "~" ) ){
        set_style( "inox" );

      // sh shell type of comments, #
      }else if( teq( ch, "#" ) ){
        set_style( "sh" );

      // C style of comments, either // or /* xxx */
      }else if( teq( ch, "/" ) ){
        set_style( "c" );

      // Forth style, either \ or ( xxx )
      }else if( teq( ch, "(" ) ){
        set_style( "forth" );

      // Lisp style, ;
      }else if( teq( ch, ";" ) ){
        set_style( "lisp" );

      // Prolog style, %
      }else if( teq( ch, "%" ) ){
        set_style( "prolog" );
      }
    }

    // If this is a monoline comment ending, emit it
    if( is_eol || is_eof ){
      // ~~ style of comments
      if( tneq( comment_monoline, "" )
        && ( teq(
          tcut( buf, tlen( comment_monoline ) ),
          comment_monoline
        ) )
      ){
        // Emit token, without start of comment sequence and without lf
        token_type = token_type_comment;
        buf = tmid( buf, tlen( comment_monoline ), -1 );
        token_text = buf;
        token_is_ready = true;
        return;
      }
      // Literate style of comments
      if( is_literate ){
        // Emit token, whole line without lf
        token_type = token_type_comment;
        buf = tcut( buf, - 1 );
        token_text = buf;
        token_is_ready = true;
        return;
      }
    }

    // If this terminates the multiline comment, emit the comment
    if( teq( ch, comment_multine_last_ch )
    && teq( tcut( buf, tlen(  comment_multiline_begin ) ),
                              comment_multiline_begin )
    && teq( tbut( buf, -tlen( comment_multiline_end ) ),
                              comment_multiline_end )
    ){
      // Emit token, without start & end of comment sequence
      token_type = token_comment_multiline;
      buf = buf.slice(
        tlen(   comment_multiline_begin ),
        - tlen( comment_multiline_end )
      );
      token_text = buf;
      token_is_ready = true;
      return;
    }

    // Premature end of file, something else was expected
    if( is_eof ){
      token_type = first_comment_seen
      ? token_type_error
      : token_type_eof;
      buf = first_comment_seen
      ? S() + "eof in token state " + state
        + " (" + token_type_to_text( state ) + ")"
      : no_text;
      token_text = buf;
      token_is_ready = true;
      return;
    }

  } // process_comment_state()


  /**/ function process_text_state() {

    // " marks the end of the text token
    if( teq( ch, "\"" ) ){
      token_type  = token_type_text;
      token_text = buf;
      token_is_ready = true;
    }

    // New lines are ok inside a "xxxx" text token
    if( teq( ch, "\n" ) ){
      toker_line_no++;
      toker_column_no = 0;
    }

    // ToDo: handle escape sequences
    buf += ch;

  } // process_text_state()


  /**/ function process_word_state() : boolean {
    // ToDo: this assert fails, why? de&&mand( buf.length > 0 );

    // If a xxx: naming prefix was there, it will come next
    if( toker_post_literal_name != "" ){
      back_token_type  = token_type_word;
      back_token_text = toker_post_literal_name;
      // ToDo: position, line_no, column_no of back token
      toker_post_literal_name = "";
    }

    // space is always a word delimiter
    if( is_space ){

      // Eager mode is blind to alias, space only matters
      if( toker_eager_mode ){
        token_text = buf;
        token_is_ready = true;
        return;
      }

      // ToDo: this fails, why? de&&mand( buf.length > 0 );

      // ToDo: refactor
      handle_literate_style();
      if( token_type == token_type_comment ){
        token_text = buf;
        token_is_ready = true;
        return;
      }

      let aliased = alias( buf );

      // If simple word substitution with an alias
      if( aliased ){
        if( tidx( aliased, " " ) == -1 ){
          buf = aliased;
          token_text = buf;
          token_is_ready = true;
        }else{
          token_de&&bug( S()+ "alias for " + buf + " is " + aliased );
          // When this happens, restart as if from new source, base state.
          // Change source code to insert the extra stuff and scan again
          // ToDo: this breaks the index/line/column scheme
          // ToDo: this is very inefficient
          // ToDo: this code is duplicated somewhere below
          toker_text = aliased + toker_text.substring( ii );
          toker_text_length  = tlen( toker_text );
          toker_alias_cursor = tlen( aliased );
          ii = 0;
          buf = "";
          state = token_base;
        }
        return;
      // Unless no alias or alias expands into more than a simple word
      }else if( !aliased ){
        token_text = buf;
        token_is_ready = true;
        return;
      }

      // Forth uses only spaces as delimiters
      if( is_forth ){
        token_text = buf;
        token_is_ready = true;
        return;
      }
    }

    de&&mand( !is_space );

    // Comma is ignored, it is there for readability only, unless Forth
    if( teq( ch, "," )
    &&  !is_forth
    &&  !toker_eager_mode
    ){
      return;
    }

    // If eager mode then only space is a terminator
    if( is_forth
    ||  toker_eager_mode
    ){
      buf += ch;
      return;
    }

    // ToDo: what comes next needs some serious refactoring

    // Get some next characters, some lookahead helps sometimes
    refill_next_ch();

    // Handle line continuation when \ is last character on line, unless Forth
    // ToDo: should be defined by style
    if( teq( ch, "\\" )
    && ch_is_eol( next_ch[ 0 ] )
    ){
      ii++;
      // Handle crlf
      if( teq( ch[ 0 ], "\r" ) && teq( next_ch[ 1 ], "\n" ) ){
        ii++;
      }
      return;
    }

    // . is a token if alone
    if( teq( ch, end_define ) ){
      is_limit = tlen( buf ) != 0 || ch_is_space( next_ch[ 0 ] );

    // ; is a token
    }else if( teq( ch, terminator_sign ) ){
      is_limit = true;

    // Some other special characters are a limit too
    }else{
      is_limit = ch_is_limit( ch, next_ch[ 0 ] );
    }

    // If no limit is reached, keep going
    if( !is_limit ){
      buf += ch;
      return;
    }

    // If there was nothing before the limit, emit a single char token
    if( tlen( buf ) == 0 && ! is_space ){
      if( teq( ch, "/" ) ){
        buf = "/";
        return;
      }else{
        start_ii = ii - 1;
        buf = ch;
        token_text = buf;
        token_is_ready = true;
      }

    // If there was something before the limit, deal with that
    }else if( tlen( buf ) >= 0 ){

      // xx(, xx[ and xx{ are words of a special type.
      // so is xxx: when before a space or /xxx/yyy which is /xxx
      if( teq( ch, "(" )
      ||  teq( ch, '[' )
      ||  teq( ch, '{' )
      ||  ( teq( ch, ':' ) && teq( next_ch[ 0 ], " " ) )
      || teq( ch, '/' ) && tneq( buf[0], "/" )
      ){
        buf = buf + ch;
        ii++;

      // ) and } are also words of a special type
      } else if(
        ( teq( ch, ")" ) || teq( ch, "}" ) )
      && ch_is_limit( next_ch[ 0 ], "" )
      ){
        buf = buf + ch;
        ii++;

      // xxx:", xxx:123, xxx:-123, to name literals
      } else if( teq( ch, ":" ) ){

        // End of word if : is before a literal or another delimiter
        // ToDo: enable :: in words?
        if( teq( next_ch[ 0 ], "\"" )
        ||  teq( next_ch[ 0 ], "-" )
        ||  ch_is_digit( next_ch[ 0 ] )
        ||  ch_is_limit( next_ch[ 0 ], "" )
        ){
          // ToDo: get rid of post_literal_name
          toker_post_literal_name = ":" + buf;
          back_token_type = token_type_word;
          back_token_text = toker_post_literal_name;
          // ToDo: handle position, line_no, column_no of back token
          toker_post_literal_name = "";
          buf = "";
        }else{
          buf += ":";
        }
        return;
      }

      // A well separated word was collected, before or with the limit
      ii--;

      // Change word if some alias was defined for it
      handle_literate_style();
      let word_alias = alias( buf );

      // In Inox style the aliases can expand into multiple words
      if( word_alias && teq( style, "inox" ) ){
        // Complex case, potentially expand into multiple tokens
        let index_space = tidx( word_alias, " " );
        if( index_space != -1 ){
          token_de&&bug( S()+ "alias for " + buf + " is " + word_alias );
          // When this happens, restart as if from new source, base state.
          // Change source code to insert the extra stuff and scan again
          // ToDo: this breaks the index/line/column scheme
          // ToDo: this is very inefficient
          toker_text = word_alias + toker_text.substring( ii );
          toker_text_length  = tlen( toker_text );
          toker_alias_cursor = tlen( word_alias );
          ii = 0;
          buf = "";
          state = token_base;
          return;
        }
      }

      if( word_alias ){
        buf = word_alias;
      }
      token_text = buf;
      token_is_ready = true;

    }
  } // process_word_state()


  /**/ function detect_infinite_loop(){
    if( !de )return;
    if( ii == previous_ii && state == previous_state ){
      bug( "Infinite loop detected in next_token" );
      debugger;
      // Skip to end of file
      ii = toker_text_length;
    }
    previous_ii    = ii;
    previous_state = state;
  }


  while( !token_is_ready ){
    detect_infinite_loop();
    process_whitespaces();
    if( token_is_ready )break;
    // State machine:
    // base -> word    -> base
    // base -> text    -> base
    // base -> comment -> base
    switch( state ){
      case token_base    : process_base_state();    break;
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
  state = token_base;

  // If a xxx: naming prefix was there, it comes next
  if( toker_post_literal_name != "" ){
    back_token_type = token_type_word;
    back_token_text = toker_post_literal_name;
    // ToDo: handle position, line_no, column_no of back token
    toker_post_literal_name = "";
  }

  // Save state for next call to next_token()
  toker_text_cursor = ii;

  if( token_de ){
    bug( S()+ "\n"
      + "Token. next is "
      + token_type_to_text( token_type ) + " " + token_text + ", "
      + "line " + N( toker_line_no )
      + " is " + extract_line( toker_text, start_ii ) + "."
    );
  }

} // next_token()


// Some basic tests of the tokenizer

/**/ function test_token( typ : number, val : text ){
/*c void      test_token( string typ, string val ){  c*/

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
  if( val != null && token_text != val ){
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

}

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

tokenizer_restart( "/**/ to debugger inox-debugger." );
test_token( token_comment_multiline, "" );
test_token( token_type_word, "to" );
test_token( token_type_word, "debugger"     );
test_token( token_type_word, "inox-debugger" );
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


/*
 *  inox-set-literate primitive
 */

primitive( "inox-set-literate", primitive_set_literate );
/**/ function                   primitive_set_literate(){
/*c  void                       primitive_set_literate( void ){ c*/
  const val = pop_boolean();
  tokenizer_set_literate_style( val ? true : false );
}


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

//const tag_inox_block             = tag( "inox-block"               );
const tag_inox_run_method_by_name  = tag( "inox-run-method-by-name" );
const tag_inox_run_method_by_tag   = tag( "inox-run-method-by-tag"  );
const tag_inox_local               = tag( "inox-local"             );
const tag_inox_set_local           = tag( "inox-set-local"         );
const tag_inox_data                = tag( "inox-data"                );
const tag_inox_set_data            = tag( "inox-set-data"            );
const tag_inox_object_get          = tag( "inox-object-get"          );
const tag_inox_object_set          = tag( "inox-object-set"          );


/*
 *  inox-integer-text? primitive
 */

const tag_inox_is_integer_text = tag( "inox-integer-text?" );

primitive( "inox-integer-text?", primitive_is_integer_text );
/**/ function                    primitive_is_integer_text(){
/*c void                         primitive_is_integer_text( void ){ c*/
  de&&mand_cell_type( TOS, tag_text );
  const buf = cell_to_text( TOS );
  clear( TOS );
  push_boolean( is_integer( buf) );
  set_tos_name( tag_inox_is_integer_text );
}


/**/ function is_integer( buf : text ) : boolean {
/*c  boolean  is_integer( text buf   ){ c*/
  return ! isNaN( parseInt( buf ) );
}


/*
 *  inox-parse-integer primitive
 */

const tag_inox_parse_integer = tag( "inox-parse-integer" );
const tag_NaN = tag( "NaN" );

primitive( "inox-parse-integer", primitive_parse_integer );
/**/ function                    primitive_parse_integer(){
/*c void                         primitive_parse_integer( void ){ c*/
  de&&mand_cell_type( TOS, tag_text );
  const buf = cell_to_text( TOS );
  clear( TOS );
  const parsed = parseInt( buf );
  if( isNaN( parsed ) ){
    push_tag( tag_NaN );
  } else {
    push_integer( parsed );
    set_tos_name( tag_inox_parse_integer );
  }
}


/**/ function text_to_integer( buf : text ) : Value {
/*c  Value    text_to_integer( text buf   )         {  c*/
  const parsed = parseInt( buf );
  de&&mand( ! isNaN( parsed ) );
  return parsed |0;
}


/*
 *  inox-eval primitive
 */

const tag_make_local = tag( "inox-make-local" );
const tag_set_local  = tag( "inox-set-local"  );
const tag_local      = tag( "inox-local"      );
const tag_make_data  = tag( "inox-make-data"    );
const tag_set_data   = tag( "inox-set-data"     );
const tag_data       = tag( "inox-data"         );


/**/ function mand_tos_is_in_bounds(){
/*c  bool     mand_tos_in_bounds()   {  c*/
  de&&mand( TOS <  ACTOR_data_stack_limit );
  de&&mand( TOS >= ACTOR_data_stack       );
}

/**/ function mand_csp_in_bounds(){
/*c  bool     mand_csp_in_bounds(){  c*/
  de&&mand( CSP <  ACTOR_control_stack_limit );
  de&&mand( CSP >= ACTOR_control_stack       );
}


/* -----------------------------------------------------------------------------
 *  inox-eval primitive
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
type MachineCode = Cell;

// A block is an array of encoded verbs from {} delimited source code.
// The first cell is named inox-block, it contains the number of cells
// in the block, including the first one and flags.
type InoxBlock = Cell;


/*
 *  Types of parse levels in the AST (Abstract Syntax Tree)
 *  It is actually a stack, not a tree.
 */

/**/ const parse_top_level     = 1;
/*c  #define parse_top_level     1  c*/
/**/ const parse_definition    = 2;
/*c  #define parse_definition    2  c*/
/**/ const parse_call          = 3;
/*c  #define parse_call          3  c*/
/**/ const parse_subexpr       = 4;
/*c  #define parse_subexpr       4  c*/
/**/ const parse_keyword       = 5;
/*c  #define parse_keyword       5  c*/
/**/ const parse_call_block    = 6;
/*c  #define parse_call_block    6  c*/
/**/ const parse_infix         = 7;
/*c  #define parse_infix         7  c*/
/**/ const parse_block         = 8;
/*c  #define parse_block         8  c*/



/**/ function    parse_type_to_text( type : number ) : text {
/*c  std::string parse_type_to_text( int type      )        {  c*/
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


/**/ function parse_type_to_tag( type : number ) : Tag {
/*c  Tag      parse_type_to_tag( int type      )       {  c*/
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


/**/ function parse_tag_to_type( tag : Tag ) : number {
/*c  int      parse_tag_to_type( Tag tag       )       {  c*/
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
// ToDo: this should be a normal array of cells too, behaving like a stack.

/*!c{*/

// Debug tool to dump the parse stack while debugging the compiler
class ParseLevel {
  type         : number  = parse_top_level;
  depth        : Index = 0;
  line_no      : Index = 0;
  column_no    : Index = 0;
  name         : text  = "";
  verb         : InoxWord = 0;
  block_start  : Index = 0;
}

// This is a stack of levels, a kind of AST, Abstract Syntax Tree
// ToDo: it should be a normal stack of cells
let parse_levels : ParseLevel[];
let parse_level  : ParseLevel;

/*}*/


// Everything about the current parse level
let parse_level_depth = 0;
let parse_level_type = 0;
/**/ let parse_level_name = "";
/*c std::string parse_level_name( "" );  c*/
let parse_level_verb = 0;
let parse_level_block_start = 0;
let parse_level_line_no = 0;
let parse_level_column_no = 0;


/**/ function init_parse_levels(){
/*c  void     init_parse_levels(){  c*/

  // ToDo: 100 is arbitrary
  /**/ parse_levels = new Array< ParseLevel >( 100 );

  let ii = 0;
  while( ii < 100 ){

    /**/ parse_levels[ ii ] = new ParseLevel();

    ii++;
  }

  // The current level is the base level
  /**/ parse_level = parse_levels[ 0 ];
  parse_level_depth = 0;
  /**/ parse_level.type = parse_top_level;
  parse_level_type = parse_top_level;
}

init_parse_levels();


// When a verb is defined, it's code is stored in a block
let new_verb = false;

// Name of new verb being defined
/**/ let new_verb_name : text;
/*c  std::string new_verb_name;  c*/

// Codes of new verb being defined, a stack
let codes;


/* ------------------------------------------------------------------------
 *  Parse levels
 *  It is actualy a stack, not a tree. This would change if I were to
 *  implement operators precedence and associativity.
 *  See also https://en.wikipedia.org/wiki/Operator-precedence_parser
 *
 *  ToDo: I should use a stack of cells instead of a stack of native objects.
 *  With push() and pop() reading/writing a set of global variables. This
 *  would be another step towards a compiler that is written in Inox itself.
 */

/*!c{*/

function bug_levels( title ){
/*c void bug_levels( std::string title ){ c*/

  /**/ let buf : string = "";
  /*c std::string buf( "" ); c*/
  buf += "Parser. Levels. " + title + " ";

  let ii = 0;
  while( ii <= parse_level_depth ){

    buf += "\n" + ii + " "
    + parse_type_to_text( parse_levels[ ii ].type )
    + ( tneq( parse_levels[ ii ].name, no_text )
      ? " = " + parse_levels[ ii ].name : no_text )
    + ", line "   + parse_level_line_no
    + ", column " + parse_level_column_no
    + ".";

    ii++;
  }

  bug( buf );
}

/*}*/


/*
 *  compiler-enter primitive
 */


/**/ function enter_level( type : number, name : string  ){
/*c  void     enter_level( int type, std::string& name   ){  c*/
// Entering a ( xx yy ), a f( xx yy ), a key: x word: y; or a {} block

  // No dump of parse levels in C++ version
  /*!c{*/
  /**/ const l = parse_levels[ parse_level.depth + 1 ];
  l.depth = parse_level.depth + 1;
  l.type  = type;
  l.name  = name;
  l.verb  = 0;
  l.block_start = 0;
  l.line_no
  = token_line_no ? token_line_no : parse_level.line_no;
  l.column_no
  = token_column_no ? token_column_no : parse_level.column_no;
  parse_level = l;
  /*}*/

  // Update global parse level variables for new level
  parse_level_depth       = parse_level_depth + 1;
  parse_level_type        = type;
  parse_level_name        = name;
  parse_level_verb        = 0;
  parse_level_block_start = 0;
  if( token_line_no ){
    parse_level_line_no   = token_line_no;
    parse_level_column_no = token_column_no;
  }

  parse_de&&bug_levels( S()
    + "Entering " + parse_type_to_text( type )
    + ", depth is " + parse_level_depth
    + ( tneq( name, no_text ) ? ( S()+ ", name is " + name ) : no_text )
  );
}


/*
 *  compiler-leave primitive
 */


/**/ function leave_level(){
/*c  void     leave_level(){  c*/

  parse_de&&bug_levels( S()
    + "Leaving " + parse_type_to_text( parse_level_type )
    + ", depth is " + parse_level_depth
  );

  let previous_level_type = parse_level_type;
  let previous_level_verb = parse_level_verb;

  parse_level = parse_levels[ parse_level_depth - 1 ];
  // ToDo: extract data from parse level stack
  parse_level_depth = parse_level_depth - 1;
  parse_level_type = parse_level.type;
  parse_level_name = parse_level.name;
  parse_level_verb = parse_level.verb;
  parse_level_block_start = parse_level.block_start;
  parse_level_line_no = parse_level.line_no;
  parse_level_column_no = parse_level.column_no;

  // parse_level.codes_count = previous_level.codes_count;

  // Close all infix operators at once
  if( previous_level_type == parse_infix ){
    eval_do_machine_code( previous_level_verb );
    if( parse_level_type == parse_infix ){
      // ToDo: avoid recursivity?
      leave_level();
    }
  }

}


/*
 *  inox-compile-definition-begin primitive
 */

immediate_primitive( "inox-compile-definition-begin",
                 primitive_compile_definition_begin );
/**/ function    primitive_compile_definition_begin(){
/*c  void        primitive_compile_definition_begin( void ){ c*/
  eval_definition_begin();
}


/**/ function eval_definition_begin(){
/*c  void     eval_definition_begin(){  c*/
// Called when entering a new verb definition, "to" if Inox dialect.

  // ToDo: should be an immediate primitive

  enter_level( parse_definition, "" );
  new_verb = true;
  codes = stack_preallocate( 100 );

  // Next token is special, it's anything until some space
  new_verb_name = "";
  toker_eager_mode = true;
  de&&mand( eval_is_expecting_the_verb_name() );
}


/*
 *  inox-compile-definition-end primitive
 */

immediate_primitive( "inox-compile-definition-end",
                 primitive_compile_definition_end );
/**/ function    primitive_compile_definition_end(){
/*c void         primitive_compile_definition_end( void ){ c*/
  eval_definition_end();
}


/**/ function eval_definition_end(){
/*c  void     eval_definition_end(){  c*/
// Called when terminating a new verb definition

  check_de&&mand( eval_is_compiling() );
  // de&&mand( stack_is_not_empty( codes ) );

  const verb_tag = tag( new_verb_name );
  const len = stack_length( codes );

  // Allocate cells, including space for header and final return
  const header = allocate_cells( len + 2 );

  // The header contains the number of codes, including the return
  set( header, type_integer, verb_tag, len + 1 );

  // Skip the header to get to the first code
  const def = header + 1 * ONE;

  // Copy new verb definition into newly allocated memory
  move_cells( stack_at( codes, 0 ), def, len );

  // Add code to return from verb, aka "return" special code
  set_return_cell( def + len * ONE );

  // Add definition to the global symbol table
  register_method_definition( verb_tag, def );

  // Update the global variable that definition flag setters use
  the_last_defined_verb = verb_tag;

  /*de*/ if( de ){
  /*de*/   const chk_def = definition_by_text_name( new_verb_name );
  /*de*/   de&&mand_eq( chk_def, def );
  /*de*/   //  Check that there is a final return.
  /*de*/   de&&mand_eq( value( chk_def + len * ONE ), 0 );
  /*de*/ }

  stack_free( codes );
  codes = 0;

  leave_level();

  // Change compilation state
  new_verb = false;
  new_verb_name = no_text;
  de&&mand( ! eval_is_compiling() );

  eval_de&&bug( S()+ "\n" + verb_to_text_definition( verb_tag ) );

} // eval_definition_end()


/*
 *  compiling? primitive
 */

/**/ function eval_is_compiling() : boolean {
/*c  boolean  eval_is_compiling(){ c*/
  if( new_verb )return true;
  return false;
}


primitive( "inox-compiling?", primitive_is_compiling );
/**/ function primitive_is_compiling() : void {
/*c  boolean  primitive_is_compiling(){ c*/
  push_boolean( eval_is_compiling() );
}


/*
 *  compiler-expecting? primitive
 */


/**/ function eval_is_expecting_the_verb_name() : boolean {
/*c  bool     eval_is_expecting_the_verb_name()           {  c*/

  // Should be called in compile mode only
  de&&mand( eval_is_compiling() );
  if( parse_level_type != parse_definition )return false;

  // Initialy the name of the verb is unknown, it follows "to"
  let it_is = teq( new_verb_name, no_text );

  // When expecting the name, eager mode must be on
  de&&mand( !it_is || toker_eager_mode );

  return it_is;
}


primitive( "inox-compiler-expecting?", primitive_state_is_expecting );
/**/ function primitive_state_is_expecting() : void {
/*c  void     primitive_state_is_expecting()             {  c*/
  push_boolean( eval_is_expecting_the_verb_name() );
}


/*
 *  compile-literal primitive
 */

/**/ function eval_do_literal(){
/*c  void     eval_do_literal(){  c*/
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
    stack_push( codes, POP() );
    parse_de&&bug( S()
      + "Parse. Parse level "
      + parse_type_to_text( parse_level_type )
      + ", with literal " + dump( stack_peek( codes ) )
      + ", now has " + stack_length( codes ) + " codes"
    );
  }else{
    stack_de&&bug( S()+ "PUSH LITERAL\n" + stacks_dump() );
  }
};


primitive( "inox-compile-literal", primitive_compile_literal );
/**/ function primitive_compile_literal() : void {
/*c  void     primitive_compile_literal(){  c*/
  eval_do_literal();
}


/**/ function eval_do_text_literal( t : text ){
/*c  void     eval_do_text_literal( text t   ){  c*/
  eval_de&&bug( S()+ "Eval. Do text literal " + t );
  if( t == ".\"" )debugger;
  push_text( t );
  eval_do_literal();
}


/**/ function eval_do_tag_literal( t : text ){
/*c  void     eval_do_tag_literal( text t   ){  c*/
  eval_de&&bug( S()+ "Eval. Do tag literal " + t );
  // if( t == "void" )debugger;
  push_tag( tag( t ) );
  eval_do_literal();
}


/**/ function eval_do_integer_literal( i : number ){
/*c  void     eval_do_integer_literal( number i   ){  c*/
  eval_de&&bug( S()+ "Eval. Do integer literal " + i );
  push_integer( i );
  eval_do_literal();
}


/*
 *  compile-verb primitive
 */

/**/ function add_machine_code( code : Tag ){
/*c  void     add_machine_code( Tag code   ){  c*/
// Add a verb to the beeing built block or new verb

  de&&mand( eval_is_compiling() );

  // Inline code definition if it is very short or if verb requires it
  const def = definition( code );
  const length = definition_length( def ) - 1;  // skip "return"
  if( length <= 1 || is_inline_verb( code ) ){
    // ToDo: inlining a constant is not a good idea when it is actually
    // a global variable...
    let ii;
    for( ii = 0 ; ii < length ; ii++ ){
      const c = def + ii * ONE;
      stack_push_copy( codes, c );
    }

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
    const new_cell = allocate_cell();
    set( new_cell, type_verb, code, 0 );
    stack_push( codes, new_cell );
    free_cell( new_cell );
  }

  de&&mand( stack_length( codes ) > 0 );

  // Remember last added code, see inox-last-token. ToDo: -last-verb?
  set_value( the_last_token_cell, code );

  parse_de&&bug( S()
    + "Parse. Parse level "
    + parse_type_to_text( parse_level_type )
    + ", with code for " + code + " " + tag_to_text( code )
    + ", now has " + stack_length( codes ) + " codes"
  );
}


/**/ function eval_do_machine_code( tag : Name ){
/*c  void     eval_do_machine_code( Name tag   ){  c*/

  // Run now or add to definition of a new verb?
  if( ! eval_is_compiling()
  || is_immediate_verb( tag )
  || immediate_mode_level != 0
  ){
    eval_de&&bug( S()
      + "Eval. do_machine_code, RUN "
      + tag + " " + tag_to_text( tag )
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

    // bug( verb_to_text_definition( code_id ) );
    de&&mand( TOS < ACTOR_data_stack_limit );

    stack_de&&bug( S()
      + "Eval. Before immediate RUN of " + tag_to_text( tag )
      + " at IP " + N( IP )
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
      + N( tag ) + " " + tag_to_text( tag )
    );
    add_machine_code( tag );
  }

};


primitive( "compile-verb",      primitive_compile_verb );
/**/ function                   primitive_compile_verb(){
/*c  primitive( "compile-verb", primitive_compile_verb ){  c*/
  const tag = pop_tag();
  eval_do_machine_code( tag );
}


/*
 *  compile-quote primitive
 */


let eval_must_not_compile_next_token = false;


/**/ function eval_quote_next_token(){
/*c  void     eval_quote_next_token(){  c*/
  eval_must_not_compile_next_token = true;
};


primitive( "compile-quote",     primitive_compile_quote );
/**/ function                   primitive_compile_quote(){
/*c  primitive( "compile-quote", primitive_compile_quote ){  c*/
  eval_quote_next_token();
}


/*
 *  compile-block-begin primitive
 */


/**/ function eval_block_begin( verb : string ){
/*c  void     eval_block_begin( std::string& verb ){  c*/

  if( tlen( verb ) == 0 ){
    enter_level( parse_block, no_text );
  }else{
    enter_level( parse_call_block, verb );
  }

  // ToDo: value could be a qualifier about the block
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

  eval_do_machine_code( tag_inox_block );

  // ToDo: handle a stack of block start indexes
  /**/ parse_level.block_start = stack_length( codes );
  parse_level_block_start = stack_length( codes );

  // Reserve one verb for block's length, like for verb definitions
  stack_push_copy( codes, 0 );
  set_type( stack_peek( codes ), type_integer );
  set_name( stack_peek( codes ), tag_inox_block );

}


primitive( "inox-compile-block-begin",  primitive_compile_block_begin );
/**/ function                           primitive_compile_block_begin(){
/*c  primitive( "inox-compile-block-begin", primitive_compile_block_begin ){  c*/
  eval_block_begin( pop_as_text() );
}


/*
 *  compile-block-end primitive
 */

/**/ function eval_block_end(){
/*c  void     eval_block_end(){  c*/

  // Add a "return" at the end of the block, a 0/0/0 actually
  stack_push_copy( codes, 0 );

  const block_length = stack_length( codes ) - parse_level_block_start;

  // Set argument for inox-block, make it look like a valid literal
  de&&mand_eq(
    name( stack_at( codes, parse_level_block_start ) ),
    tag_inox_block
  );
  set_value(
    stack_at( codes, parse_level_block_start ),
    ( block_length - 1 ) | block_verb_flag
  ); // -1 not to add the length verb

  leave_level();
}


primitive( "inox-compile-block-end",    primitive_compile_block_end );
/**/ function                           primitive_compile_block_end(){
/*c  primitive( "inox-compile-block-end", primitive_compile_block_end ){  c*/
  eval_block_end();
}


/*
 *  Helpers to strip prefix and suffix from a verb
 */

/**/ function operand_X( v : text ) : text {
/*c  text     operand_X( text v   )        {  c*/
// remove first character, ex .a becomes a
  return tbut( v, 1 );
}


/**/ function operand__X( v : text ) : text {
/*c  text     operand__X( text v   )        {  c*/
// remove firts two characters
  return tbut( v, 2 );
}


/**/ function operand_X_( v : text ) : text {
/*c  text     operand_X_( text v   )        {  c*/
// remove first and last characters
  return tmid( v, 1, -1 );
}


/**/ function operandX_( v : text) : text  {
/*c  text     operandX_( text v  )         {  c*/
// remove last character
  return tcut( v, -1 );
}

/*
 *  Special verbs are verbs whose names are special.
 *  . ; ( ) { and } are special verbs.
 *  verbs starting with . / # > or _ are usually special.
 *  verbs ending with : / # > _ ( or { are usually special.
 *  There are exceptions.
 *  Verbs ending with ? are not special.
 *  Verbs starting and ending with the same character are not special.
 *  Single character verbs are not special.
 *  What is special about special verbs is that they cannot be redefined.
 *  They have special meanings understood by the compiler.
 *  Note: , is a very special character, it always behaves as a space.
 */

/**/ function is_special_verb( val : text ) : boolean {
/*c  boolean  is_special_verb( text val   ) {  c*/
  if( val == "." || val == ";" )return true;
  if( val == "(" || val == ")" )return true;
  if( val == "{" || val == "}" )return true;
  if( tlen( val ) < 2 )return false;
  const first_ch = val[0];
  const last_ch  = tlen( val ) > 1 ? val[ tlen( val ) - 1 ] : first_ch;
  if( last_ch == "?" )return false;        // Predicates are not special
  if( last_ch == first_ch )return false;   // xx and x...x is not special
  if( first_ch != "." && first_ch != ":"   // Member access and naming
  &&  last_ch  != "." && last_ch  != ":"   //   idem
  &&  first_ch != "/" && first_ch != "#"   // Tags
  &&  last_ch  != "/" && last_ch  != "#"   //   idem
  &&  first_ch != ">" && first_ch != "_"   // Local & data variables
  &&  last_ch  != ">" && last_ch  != "_"   //   idem
  &&  last_ch  != "(" && last_ch  != "{"   // Calls and block calls
  &&  last_ch  != first_ch
  ){
    return false;
  }
  // .x x. :xx xx: /x x/ #x x# >x x> _x x_ x( x{
  return true;
}

/*
 *  eval primitive
 */

/**/ function tok_match( t : Index, s : string ) : boolean {
/*c  boolean  match( Index t, std::string& s ) {  c*/
  if( token_type != t )return false;
  if( tneq( token_text, s ) )return false;
  return true;
}


/**/ function tok_word( s : text ) : boolean {
/*c  boolean  word( std::string& s ) {  c*/
  return tok_match( token_type_word, s );
}


/**/ function tok_type( t : Index ) : boolean {
/*c  boolean  type( Index t ) {  c*/
  return token_type == t;
}


/**/ function tok( s : text ) : boolean {
/*c  boolean  tok( std::string& s ) {  c*/
  return teq( token_text, s );
}


primitive( "inox-eval", primitive_eval );
/**/ function           primitive_eval() : void {
/*c  void               primitive_eval( void )  {  c*/

  // The source code to evaluate is at the top of the stack, get it
  /**/ const       source : text = pop_as_text();
  /*c  std::string source        = pop_as_text();  c*/

  // Reinitialize the stream of tokens
  tokenizer_restart( source );
  eval_de&&bug( S()+ "inox-eval " + tcut( source, 100 ) );

  // The base level is the initial state of the parser
  init_parse_levels();

  // An existing verb named like the token's text value
  let verb_id : Index;

  // Word to start a new verb definition
  /**/ let         define : text = "to";
  /*c  std::string define(         "to" );  c*/
  // That's for the Inox dialect, Forth uses shorter :

  // Name of verb for xxx( ... ) and xxx{ ... } calls
  /**/ let         call_verb_name  = "";
  /*c  std::string call_verb_name(   "" );  c*/

  let done            = false;
  let is_special_form = false;

  /* ---------------------------------------------------------------------------
   *  Eval loop, until error or eof
   */

  // ToDo: stackless eval loop
  while( true ){

    de&&mand_tos_is_in_bounds();

    // This will update global variables token_type, token_text, etc
    next_token();

    // The C++ version does not handle the "de" flag, so far
    /*de*/ if( de && token_text == "token-debugger" )debugger;

    // ~~ and ~~| ... |~~, skip these comments
    if( tok_type( token_type_comment )
    ||  tok_type( token_comment_multiline )
    ){
      // ToDo: verb for definitions should be normal verbs
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
      if( parse_level_type != parse_top_level ){
        bug( S()+ "Eval, premature end of file" );
        debugger;
      }
      break;
    }

    // to, it starts an Inox verb definition
    // ToDo: handle this better, : and to could be verbs as in Forth
    // ToDo: should be outside the loop but can change inside...
    let is_forth = ( teq( style, "forth" ) );
    if( is_forth ){
      define = ":";
    }else if( teq( style, "inox" ) ){
      define = "to";
    }

    // "to" is detected almost only at the base level
    // ToDo: enable nested definitions?
    if( tok_word( define ) ){
      // As a convenience it may terminate an unfinished previous definition
      if( parse_level_type == parse_definition
      &&  token_column_no == 0
      &&  stack_length( codes ) > 0
      &&  !eval_is_expecting_the_verb_name()
      ){
        eval_definition_end();
      }
      if( parse_level_type == parse_top_level ){
        eval_definition_begin();
        de&&mand( eval_is_expecting_the_verb_name() );
        continue;
      }
    }

    // eol, an absence of indentation may terminate a non empty definition
    if( tok_match( token_type_indent, "--" )
    &&  token_column_no    == 0
    &&  parse_level_type   == parse_definition
    &&  stack_length( codes ) > 0
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
      new_verb_name = token_text;
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
      &&  parse_level_type != parse_definition
      ){
        token_type = token_type_word;
        token_text = end_define;
      }
    }

    // . or ; or ) or } terminator ? first close all postponed infix operators
    if( parse_level_type == parse_infix
    && ( tok_type( token_type_word )
      && ( ( tok( ";" ) && !is_forth )
        || tok( ")" )
        || tok( "}" )
        || tok( end_define ) // "."
      )
    ) ){
      leave_level();
    }

    // to, again ? common error is to forget some ; ) or }
    if( eval_is_compiling()
    &&  tok_word( define )
    ){
      bug( S()
        + "Parser. Nesting error, unexpected " + token_text
        + " at line " + N( token_line_no )
        + " while expecting the end of "
        + parse_type_to_text( parse_level_type )
        + " in definition of " + new_verb_name
        + " at line " + N( parse_level_line_no )
        + ", column " + N( parse_level_column_no )
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
    done = false;
    verb_id = 0;
    is_special_form = false;
    // ToDo: handle integer and float literals here
    const is_int = is_integer( token_text );

    // Sometimes it is the last character that help understand
    /**/ let  first_ch
    /*c  char first_ch c*/
    = token_text[ 0 ];

    /**/ let last_ch
    /*c  char last_ch c*/
    = tlen( token_text ) > 1 ? token_text[ tlen( token_text ) - 1 ] : first_ch;

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
    if( is_forth
    &&  ! tok( ";" )
    &&  ! tok( "{" )
    &&  ! tok( "}" )
    &&  !is_int
    ){
      if( !verb_exists( token_text ) ){
        parse_de&&bug( S()+ "Parser. Undefined verb: " + token_text );
        debugger;
      }else{
        verb_id = tag( token_text );
      }

    // In Inox some verbs are special, they can not be defined in the dictionary
    }else{

      is_special_form = is_special_verb( token_text );

      if( !is_special_form
      &&  !is_int
      ){
        if( !verb_exists( token_text ) ){
          parse_de&&bug( S()+ "Parser. Undefined verb: " + token_text );
          breakpoint()
          // ToDo: warning, user enabled
          // debugger;
        }else{
          verb_id = tag( token_text );
        }
      }

    }

    // If existing verb, we're almost done
    let is_operator = false;
    if( verb_id != 0 ){

      is_operator = !is_forth && !!is_operator_verb( verb_id );

      // If operator, transform order to get to RPN, Reverse Polish Notation
      if( is_operator
      && ( parse_level_type != parse_definition
        && parse_level_type != parse_block )
      && ( parse_level_type == parse_call
        || parse_level_type == parse_subexpr
        || parse_level_type == parse_infix
        || parse_level_type == parse_keyword
        || true
      )){

        if( parse_level_type != parse_call
        &&  parse_level_type != parse_call_block
        &&  parse_level_type != parse_subexpr
        &&  parse_level_type != parse_infix
        &&  parse_level_type != parse_keyword
        )debugger;

        // If after another operator, left association
        // ToDo: configurable associativity and precedence
        if( parse_level_type == parse_infix ){
          leave_level();
        }

        // Otherwise processing occurs later at ; or start of keyword
        enter_level( parse_infix, token_text );
        parse_level_verb = verb_id;
        continue;
      }

      is_operator = false;

      // function calls, keyword method calls and sub expressions
      if( parse_level_depth > 0
      &&  parse_level_verb == 0
      ){

        // If building a function call and expecting the function name
        if( false && parse_level_type == parse_call
        &&  teq( parse_level_name, no_text )
        ){
          /**/ parse_level.name = token_text;
          parse_level_name = token_text;
          /**/ parse_level.verb = verb_id;
          parse_level_verb = verb_id;
          continue;
        }

        // If building a block call and expecting the function name
        if( false && parse_level_type == parse_block
        &&  teq( parse_level_name, no_text )
        ){
          /**/ parse_level.name = token_text;
          parse_level_name = token_text;
          /**/ parse_level.verb = verb_id;
          parse_level_verb = verb_id;
          continue;
        }

        // If building a keyword method call
        if( parse_level_type == parse_keyword
        &&  teq( last_ch, ":" )
        ){
          /**/ parse_level.name += token_text;
          parse_level_name += token_text;
          eval_de&&bug( S()+ "Eval. Collecting keywords:" + parse_level_name );
          continue;
        }
      }

    }

    // If known verb, run it or add it to the new verb beeing built
    // Unless operators and pieces of keyword calls.
    if( verb_id != 0
    && !is_operator
    ){
      // This does not apply to operators and keyword calls
      eval_do_machine_code( verb_id );
      continue;
    }

    de&&mand( tok_type( token_type_word ) || tok_type( token_type_indent ) );

    // . or ; end of definition of the new Inox verb reached
    if( eval_is_compiling()
    && tok( end_define )
    && parse_level_type == parse_definition
    // && stack_is_not_empty( codes )
    ){
      eval_definition_end();
      continue;
    }

    // xxx: piece of a keyword call
    // This is inspired by Smalltalk's syntax.
    // See https://learnxinyminutes.com/docs/smalltalk/
    if( teq( last_ch, ":" ) ){
      // first close all previous nested infix operators
      if( parse_level_type == parse_infix ){
        leave_level();
      }
      // If already collecting keywords of call, add new keyword item
      if( parse_level_type == parse_keyword ){
        /**/ parse_level.name += token_text;
        parse_level_name += token_text;
      // If first element of a xxx: aaa yyy: bbb keyword call
      }else{
        enter_level( parse_keyword, token_text );
      }
      continue;
    }

    // ( of xxx(  or ( of ( sub expression )
    if( teq( last_ch, "(" ) ){
      // if ( of ( expr )
      if( tlen( token_text ) == 1 ){
        enter_level( parse_subexpr, no_text );
      // if ( of xxx(
      }else{
        const operand = operandX_( token_text );
        enter_level( parse_call, operand );
      }
      done = true;

    // { of xxx{ or { of { block }
    }else if( teq( last_ch, "{" ) ){
      // { start of a block
      if( tlen( token_text ) == 1 ){
        if( eval_is_compiling() ){
          eval_block_begin( no_text );
        // If { start of a block but not within a definition
        }else{
          // ToDo: handle this case, avoiding memory leak
          bug( S()
            + "Cannot compile block, not in a definition, "
            + "at line "  + N( token_line_no )
            + ", column " + N( token_column_no )
          );
          debugger;
        }
      // if xxx{
      }else{
        if( eval_is_compiling() ){
          // enter_level( parse_call_block, eval_token_value );
          eval_block_begin( token_text );
          parse_de&&bug( S()+ "Eval. Block call:" + parse_level_name );
        }else{
          bug( S()
            + "Cannot compile block, not in a definition, "
            + "at line "  + N( token_line_no )
            + ", column " + N( token_column_no )
          );
          debugger;
        }
      }
      done = true;

    // } end of a { block } or end of a xxx{
    }else if( teq( last_ch, "}" ) ){

      if( parse_level_type == parse_call_block
      ||  parse_level_type == parse_block
      ){

        // If end of a xxx{
        if( parse_level_type == parse_call_block ){
          call_verb_name = parse_level_name;
          eval_block_end();
          // If .xxx{ call
          if( tlen( call_verb_name ) > 1
          &&  teq( call_verb_name[0], "." ) // ToDo: first_ch?
          ){
            eval_do_tag_literal( operand_X( call_verb_name ) );
            eval_do_machine_code( tag_inox_run_method_by_name );
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
        if( tlen( token_text ) > 1 ){
          eval_do_tag_literal( operand_X( token_text ) );
          eval_do_machine_code( tag_inox_rename );
        }

      // Premature/unexpected }
      }else{
        bug( S()
          + "Parser. Nesting warning, unexpected } "
          + " at line " + N( token_line_no )
          + ", column " + N( token_column_no )
          + ", while expecting the end of " + parse_level_type
        );
        done = true;
      }

      done = true;

    // ) end of a ( sub expression ) or end of xxx( function call
    }else if( teq( first_ch, ")" ) ){

      if( parse_level_type == parse_subexpr
      ||  parse_level_type == parse_call
      ){

        if( parse_level_type == parse_call ){

          call_verb_name = parse_level_name;

          // ) of .xxx( )
          if( tlen( call_verb_name ) > 1
          &&  teq( call_verb_name[0], "." )
          ){
            // ToDo: what would be the meaning of .( xxxx ) ?
            // It could call some xxxx.call method of the target object
            // popped from the data stack. This would be convenient
            // for verb value and some block, /**/ function, callable, etc, objects.
            // ToDo: should it be a tag or a text literal?
            eval_do_tag_literal( operand_X( call_verb_name ) );
            eval_do_machine_code( tag_inox_run_method_by_name );

          // ) of xxx( )
          }else{
            verb_id = tag( call_verb_name );
            /**/ parse_level.verb = verb_id;
            parse_level_verb = verb_id;
            if( verb_id ){
              eval_do_machine_code( parse_level_verb );
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
        if( tlen( token_text ) > 1 ){
          eval_do_tag_literal( operand_X( token_text ) );
          eval_do_machine_code( tag_inox_rename );
        }

        leave_level();

      // Premature/unexpected )
      }else{
        bug( S()
          + "Parser. Nesting warning, unexpected ) "
          + " at line " + N( token_line_no )
          + ", column " + N( token_column_no )
          + ", while expecting the end of " + parse_level_type
        );
      }
      done = true;

    // ; (or .) marks the end of the keyword method call, if any
    }else if(
      (  tok( ";" )
      || tok( end_define ) )
    && parse_level_type == parse_keyword
    // ToDo: }, ) and ] should also do that
    ){

      while( parse_level_type == parse_keyword ){

        // .xx: ... yy: ... ; keyword method call
        if( teq( parse_level_name[0], "." ) ){
          // ToDo: should it be a tag or a text literal?
          // Hint: use a tag if it already exist? a text otherwise?
          eval_do_tag_literal( tcut( parse_level_name, 1 ) );
          eval_do_machine_code( tag_inox_run_method_by_tag );

        // not a keyword method call
        }else{

          // If not multipart, remove trailing :
          if( tidx( parse_level_name, ":" )
          == tlen( parse_level_name ) - 1
          ){
            /**/ parse_level.name = tcut( parse_level_name, -1 );
            parse_level_name = tcut( parse_level_name, -1 );
          }

          // If verb does not exist, use missing-verb instead
          if( !verb_exists( parse_level_name ) ){
            eval_do_text_literal( parse_level_name );
            eval_do_machine_code( tag_missing_verb );
            if( warn_de ){
              trace( parse_level_name );
              trace( "Warning, missing verb" );
            }
          }else{
            verb_id = tag( parse_level_name );
            eval_do_machine_code( verb_id );
          }
        }
        leave_level();
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

    }else if( is_special_form ){
      done = true;

      // /xxx or #xxxx, it's a tag
      if( teq( first_ch, "/" )
      ||  teq( first_ch, "#" )
      ){
        eval_do_tag_literal( operand_X( token_text ) );

      // xxx/ or xxx#, it's a tag too.
      }else if( teq( last_ch, "/" )
      ||        teq( last_ch, "#" )
      ){
        eval_do_tag_literal( operandX_( token_text ) );

      // >xxx!, it's a lookup in the control stack with store
      }else if( teq( first_ch, ">" )
      && teq( last_ch, "!" )
      && tlen( token_text ) > 2
      ){
        eval_do_tag_literal( operand_X_( token_text ) );
        eval_do_machine_code( tag_inox_set_local );

      // >xxx, it's a make in the control stack
      }else if( teq( first_ch, ">" ) ){
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_make_local );

      // xxx>, it's a lookup in the control stack with fetch
      }else if( teq( last_ch, ">" ) ){
        eval_do_tag_literal( operandX_( token_text ) );
        eval_do_machine_code( tag_inox_local );

      // .:xxxx, it's a method call
      }else if( teq( first_ch, "." )
      && tlen( token_text ) > 2
      && teq( token_text[ 1 ], ":" )
      ){
        // ToDo: should it be a tag or a text operand?
        eval_do_tag_literal( operand_X( operand_X( token_text ) ) );
        eval_do_machine_code( tag_inox_run_method_by_name );

      // .xxxx!, it's a lookup in an object with store
      }else if( teq( first_ch, "." )
      && teq( last_ch, "!" )
      && tlen( token_text ) > 2
      ){
        eval_do_tag_literal( operand_X_( token_text ) );
        eval_do_machine_code( tag_inox_object_set );

      // .xxxx, it's a lookup in an object with fetch
      }else if( teq( first_ch, "." )
      && tlen( token_text ) > 1
      ){
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_inox_object_get );

      // _xxxx!, it's a lookup in the data stack with store
      }else if( teq( first_ch, "_" )
      && teq( last_ch, "!" )
      && tlen( token_text ) > 2
      ){
        eval_do_tag_literal( operand_X_( token_text ) );
        eval_do_machine_code( tag_inox_set_data );

      // _xxxx, it's a lookup in the data stack with fetch
      }else if( teq( first_ch, "_" ) ){
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_inox_data );

      // xxx_, it's a naming operation
      }else if( teq( last_ch, "_" ) ){
        eval_do_tag_literal( operandX_( token_text ) );
        eval_do_machine_code( tag_inox_rename );

      // :xxxx, it's a naming operation, explicit, Forth style compatible
      }else if( teq( first_ch, ":" ) ){
        // ToDo: optimize the frequent literal /tag inox-rename sequences
        eval_do_tag_literal( operand_X( token_text ) );
        eval_do_machine_code( tag_inox_rename );

      // xxx:, it's also a naming operation
      }else if( teq( last_ch, ":" ) ){
        eval_do_tag_literal( operandX_( token_text ) );
        eval_do_machine_code( tag_inox_rename );

      // {xxx}, it's a short block about a verb or a /{xxx} tag literal
      }else if( teq( first_ch, "{" )
      && teq( last_ch, "}" )
      && tlen( token_text ) > 2
      ){
        const verb = operand_X_( token_text );
        if( verb_exists( verb ) ){
          eval_do_integer_literal( definition( tag( verb ) ) );
        }else{
          eval_do_tag_literal( token_text );
        }

      }else{
        done = false;
      }
    }

    if( !done ){

      // ( start of subexpression
      if( tok( "(" ) ){
          debugger; // never reached?
          enter_level( parse_subexpr, "" );

      // if xxx(
      }else if( teq( last_ch, "(" ) ){
        debugger; // never reached?

        enter_level( parse_call, token_text );

        // If start of xxx( ... )
        if( tneq( first_ch, "." ) ){
          /**/ parse_level.name = token_text;
          parse_level_name = token_text;
          done = true;
        }

      // Else, this is a literal number or a missing verb
      }else{
        if( is_int ){
          eval_do_integer_literal( text_to_integer( token_text) );
        }else if( teq( first_ch, "-" )
        && is_integer( tcut( token_text, 1 ) )
        ){
          eval_do_integer_literal(
            - text_to_integer( tcut( token_text, 1 ) )
          );
        }else{
          eval_do_text_literal( token_text );
          eval_do_machine_code( tag_missing_verb );
        }
      }
    }
  }

} // primitive inox-eval


/* ----------------------------------------------------------------------------
 *  Some bootstrap stuff
 */

/*
 *  inox-trace primitive
 */

primitive( "inox-trace", primitive_trace );
/**/ function            primitive_trace(){
/*c void                 primitive_trace( void ){ c*/
// Output using console.log(), preserve TOS
  de&&mand_cell_type( TOS, type_text );
  const text = cell_to_text( TOS );
  clear( POP() );
  // ToDo: output to stdout when running on POSIX systems
  console.log( S()+ "\nTRACE " + text );
}


/*
 *  inox-out primitive
 */

primitive( "inox-out", primitive_out );
/**/ function          primitive_out(){
/*c void               primitive_out( void ){ c*/
  primitive_trace();
}


/*
 *  inox-trace-stacks primitive
 */

primitive( "inox-trace-stacks", primitive_trace_stacks );
/**/ function                   primitive_trace_stacks(){
/*c void                        primitive_trace_stacks( void ){ c*/
  // ToDo: push text instead of using console.log() ?
  bug( S()+ "STACKS TRACE\n" + stacks_dump() );
}


// In some other dialects there are other names for this
define_alias( "sh",     "echo",   "out")
define_alias( "basic",  "PRINT",  "out" );
define_alias( "icon",   "write",  "out" );
define_alias( "python", "print",  "out" );
define_alias( "c",      "printf", "out" );
define_alias( "prolog", "write",  "out" );


/*
 *  To/from ASCII codes.
 */

const tag_ascii = tag( "ascii" );

primitive( "inox-ascii-character", primitive_ascii_character );
/**/ function                      primitive_ascii_character(){
/*c void                           primitive_ascii_character( void ){ c*/
// Return a one character text from the TOS integer ascii code
  const char_code = eat_integer( TOS );
  const ch = String.fromCharCode( char_code );
  set_text_cell( TOS, ch );
  set_tos_name( tag_ascii );
}


primitive( "inox-ascii-code", primitive_ascii_code );
/**/ function                 primitive_ascii_code(){
/*c void                      primitive_ascii_code( void ){ c*/
// Return ascii code of first character of TOS as a text
  const code = cell_to_text( TOS ).charCodeAt( 0 );
  clear( TOS );
  set( TOS, type_integer, code, tag_ascii );
}


/*
 *  inox-now primitive
 */

const tag_now = tag( "now" );

primitive( "inox-now", primitive_now );
/**/ function               primitive_now(){
/*c void                    primitive_now( void ){ c*/
  push_integer( now() - time_started );
  set_tos_name( tag_now );
}


/*
 *  inox-instructions primitive
 */

const tag_instructions = tag( "instructions" );

primitive( "inox-instructions", primitive_instructions );
/**/ function                   primitive_instructions(){
/*c void                        primitive_instructions( void ){ c*/
  push_integer( instructions_total );
  set_tos_name( tag_instructions );
}


/*
 *  inox-the-void primitive
 */

primitive( "inox-the-void", primitive_the_void );
/**/ function               primitive_the_void(){
/*c void                    primitive_the_void( void ){ c*/
  PUSH();
}


/* ----------------------------------------------------------------------------
 *  exports
 */

/**/ function evaluate( source_code ){
/*c void evaluate( std::string source_code ){ c*/
  push_text( source_code );
  run_eval();
  // Return empty string if stack is empty
  if( TOS == ACTOR_data_stack ){
    return "";
  }
  // Else, pop the result from the stack and return it as a text
  de&&mand_tos_is_in_bounds();
  const result = cell_to_text( TOS );
  clear( POP() );
  return result;
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
/**/ ){
/*c void processor( std::string json_state, std::string json_event, std::string source_code ){ c*/

  // ToDo: restore state and provide event from json encoded values
  // The idea there is about code that can execute in a stateless manner
  // even when some state is required. Basically the whole state is
  // turned into an immutable value and Inox programs simply process
  // that value to produce another value that is a new state.
  // As a result every Inox program could run on any machine and
  // it would be the job of some "orchestration" layer to dispatch
  // jobs and propagate state changes harmoniouly. Not a simple task.
  let state = JSON.parse( json_state );
  let event = JSON.parse( json_event );

  // ToDo: build state object and push it onto the data stack.
  // ToDo: build event object and push it onto the data stack.

  // If source code was provided, push it on the parameter stack
  // See http://c2.com/cybords/pp4.cgi?muforth/README

  push_text( source_code );
  run_eval();

  // ToDo: return diff to apply instead of new state
  // ToDo: cell_to_json_text( TOS );
  let new_state = JSON.stringify( cell_to_text( TOS ) );

  primitive_clear_data();
  primitive_clear_control();

  // ToDo: check that stacks are empty and clear all memory that can be cleared
  return new_state;

} // process()


/* -----------------------------------------------------------------------------
 *  Typescript version of bootstrap and read-eval-print loop
 */

// Not on metal
/*!c{*/

/*
 *  export functions for those who creates javascript primitives
 */

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

/*}*/

// console.log( "C SOURCE:\n" + C_source + "\n" );

// ToDo provide a mechanism to register event handlers
/**/ function signal( event : string ){
/*c  void     signal( std::string event ){ c*/
  // ToDo: push event object onto the data stack
  // ToDo: run_verb( "inox-signal" );
}

/**/ function on( event : string, handler : ( e : text ) => void ){
/*c void      on( std::string event, void (*handler)( std::string e ) ){ c*/
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


/* --------------------------------------------------------------------------
 *  Bootstraping and smoke test.
 */

const I   = inox();
const Fun = I.fun;


function bootstrap_with_file( name ){
  const source_code = require( "fs" ).readFileSync( "lib/" + name, 'utf8');
  I.processor( "{}", "{}", source_code );
}


/*
 *  inox-source primitive
 */

I.primitive( "inox-source", primitive_source );
function                    primitive_source(){
// Load a file and evaluate the content
  // ToDo: require, ?require, required?
  // ToDo: include, ?include, included?
  // ToDo: module management
  bootstrap_with_file( Fun.pop_as_text() );
}


bootstrap_with_file( "bootstrap.nox" );
bootstrap_with_file( "forth.nox" );
if( run_de ){
  bootstrap_with_file( "test/smoke.nox" );
}


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

function repl(){

  const repl = require( "node:repl" );

  /*
   *  inox-repl-out primitive
   */

  I.primitive( "inox-repl-out", primitive_repl_dot );
  /**/ function                      primitive_repl_dot(){
    process.stdout.write( Fun.pop_as_text() );
  }

  // Redefine basic-out into inox-repl-out
  I.evaluate( "~| redefine output stream |~ to basic-out inox-repl-out." );

  // Define . Forth word, which writes TOS on stdout
  I.evaluate( "( . writes TOS on stdout )  : .  out ;" );

  // Start the REPL, welcome!
  process.stdout.write( "Inox\n" );
  const duration_to_start = now() - time_started;
  process.stdout.write( S()+ duration_to_start + " ms"
  + " and " + (
    Math.ceil( instructions_total / duration_to_start
    / 1000000 * 1000 ) )
  + " millions instructions per second to start REPL\n" );

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

time_started = now();

/*!c{*/

function init_globals(){
}

init_globals();

/*}{

void init_globals(){
  ALL_PRIMITIVE_DECLARATIONS
}

void TODO( char *message ){
  fprintf( stderr, "TODO: %s", message );
}

void add_history( std::string line ){
  TODO( "add_history: free the history when the program exits" );
}


int repl(){
  while( true ){
    std::string line = readline( "ok " );
    if( !line ){
      // ToDo: should try to convert TOS into an integer
      break;
    }
    add_history( line );
    evaluate( line );
    free( line );
  }
}


int main( int argc, char *argv[] ){
  init_globals();
  // ToDo: fill some global ENV object
  // ToDo: push ENV object & arguments onto the data stack
  return repl();
}

}*/

// That's all Folks!
