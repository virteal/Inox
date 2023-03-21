/*  inox.ts
 *    Inox language
 *
 *  june      3 2021 by jhr
 *  june      7 2021 by jhr, move from .js to .ts, ie TypeScript, AssemblyScript
 *  june     10 2021 by jhr, .nox file extension
 *  june     27 2021 by jhr, forth hello world is ok, literate comment in Inox
 *  july     17 2021 by jhr, turing complete
 *  july     28 2021 by jhr, use 64 bits instructions, code and data unification
 *  october  10 2021 by jhr, source code cleanup
 *  december  7 2022 by jhr, class, object, malloc/free, refcount gc
 *  decembre 26 2022 by jhr, reactive dataflows and reactive sets from Toubkal
 *  january  29 2023 by jhr, crossed the 10 000 lines of code frontier
 *  february 27 2023 by jhr, runs in C++, 15Kloc, 95 Mips
 *  march    18 2023 by jhr, almost 20Kloc, 220 Mips, Cheerp C++ to wasn
 *
 *  International license:
 *    Lastest version of WTFPL.
 *    See https://en.wikipedia.org/wiki/WTFPL
 *  License pour la France :
 *    Faites en ce que vous voulez, à vos risques et périls.
 */

/**
 *  @author Jean Hugues Noel Robert
 *  @license WTFPL
 *  @brief This is the one big source file of the Inox programming language
 *  @mainpage The Inox programming language
 *  Inox is a concatenative script language.
 *  For more information, see https://github.com/virteal/Inox
 */

/* ----------------------------------------------------------------------------
 *  Some constant definitions.
 */

/// 0: no debug, 1: some debug, 2: more debug, etc
const INOX_DEBUG_LEVEL = 0;

/// The initial size of the flat memory where the Inox interpreter will run
// ToDo: make the size configurable at run time ?
const INOX_HEAP_SIZE = 64 * 1024; // Minimum is 24 bytes

/// The initital length of the symbol table
const INOX_SYMBOL_TABLE_SIZE = 2048;


/* ----------------------------------------------------------------------------
 *  Literate programming.
 *  See https://en.wikipedia.org/wiki/Literate_programming

To some extend this source file is a literate program. That does not mean
that it's a program that is easy to read and understand, it just mean that
trying to do so is encouraged. You may learn a few things about interpreters,
object oriented programming, memory management and various data structures.

To the extend possible, some explanations are given in the source code when
a new concept is introduced. Yet it is not a tutorial about programming.
It's a reference implementation of a concatenative script language.

Concatenative languages are a very old idea. The Forth language is the
best known concatenative language. It's a stack based language, as Inox.
See https://en.wikipedia.org/wiki/Forth_(programming_language)

The reference implementation is a virtual machine,
see https://en.wikipedia.org/wiki/Virtual_machine

 */


/* ----------------------------------------------------------------------------
 *  Cross platform.
 *
 *  This source file is processed in various ways in order to produce multiple
 *  targets. The first target is the reference implementation, a virtual machine
 *  that runs on the web browser and on node.js. It's written in TypeScript.
 *  Work is in progress to produce a second target, a C++ version.
 *
 *  The source code is written in TypeScript. It's a superset of Javascript.
 *  It's syntax is close to AssemblyScript, Java and C++, ie C style.
 *
 *  There is no macro processor in TypeScript, so the source code is annotated
 *  with special comments processed to produce the other targets, specially the
 *  C++ target. See build_targets() below.
 */
 //  /**/        to ignore the rest of the line when in C++
 //  /*as*/      to ignore the rest of the line when in AssemblyScript
 //  //c/ xxxx   to include code when in C++ only, mono line
 //  //as/ xxxx  to include code when in AssemblyScript only, mono line
 //  /*ts{*/     to switch to TypeScript specific code
 //  /*}*/       end of TypeScript specific code
 //  /*c{        to switch to C++ specific code
 //  /*as{       to switch to AssembyScript specific code
//   }*/         end of specific code

/*
 *  On Windows, using cl.exe, the compiler flags in debug mode are:
 *  "/DEBUG",
 *  "/W4",
 *  "/nologo",
 *  "/utf-8",
 *  /Zi",
 *  "/JMC",
 *  /EHsc",
 *  "/fsanitize=address",
 *  "/std:c++latest",
 *
 *  On Windows, using cl.exe, the compiler flags in fast mode are:
 *  "/W4",
    "/nologo",
    "/utf-8",
    "/O2",
    "/Ot",
    "/Ob2",
    "/Oi",
    "/GL",
    "/Gr",
    "/Gw",
    "/Gy",
    "/GF",
    "/GS-",
    "/GR-",
    "/DINOX_FAST",
    "/EHsc",
    "/std:c++latest",
    "/link",
    "/OPT:REF"
 */

/*c{

// ToDo: remove unused includes
#include <cstring>
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

// Need speed, security is managed otherwise
#pragma warning(disable:4996)
#define _CRT_SECURE_NO_WARNINGS


// ----------------------------------------------------------------------------
//  To avoid using C's standard library about file I/O, we define our own
//  version of the Unix API. This is not a complete implementation, just enough
//  to support the Inox standard library.

// File open mode, read only
#define O_RDONLY 1

static int open( const char* path, int mode ){
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
  // HANDLE is not supposed to be casted to int, but it works.
  return (int) file_handle;
}


static int close( int fd ){
  // Windows version to close a file
  if( fd <= 0 )return 0;
  HANDLE file_handle = (HANDLE) fd;
  CloseHandle( file_handle );
  return 0;
}


static int read( int fd, void* buf, int count ){
  DWORD read_count;
  if( fd < 0 )return -1;
  HANDLE h = (HANDLE) fd;
  // Special handling for stdin
  if( fd == 0 ){
    h = GetStdHandle( STD_INPUT_HANDLE );
    if( h == INVALID_HANDLE_VALUE )return -1;
  }
  auto status = ReadFile( h, buf, count, &read_count, NULL );
  if( status == 0 )return -1;
  return (int) read_count;
}


static int write( int fd, const void* buf, int count ){
  DWORD written_count;
  // Works only for stdout and stderr
  if( fd != 1 && fd != 2 )return -1;
  HANDLE h = GetStdHandle( fd == 1 ? STD_OUTPUT_HANDLE : STD_ERROR_HANDLE );
  if( h == INVALID_HANDLE_VALUE )return -1;
  auto status = WriteFile( h, buf, count, &written_count, NULL );
  if( status == 0 )return -1;
  return (int) written_count;
}

#else
  #include <unistd.h>
  #include <fcntl.h>
  #include <sys/ioctl.h>
#endif

}*/


/* ----------------------------------------------------------------------------
 *
 */

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

static milliseconds now( void ){
  auto t = high_resolution_clock::now();
  auto te = t.time_since_epoch();
  milliseconds te_ms = duration_cast< milliseconds >( te );
  return te_ms;
}

}*/


/**/  const time_start = now();
/**/  let   time_started = 0;
/*c{
  milliseconds time_start = now();
  milliseconds time_started;
}*/


/*
 *  This is the reference implementation. It defines the syntax and semantic
 *  of the language. Production quality version of the virtual machine would
 *  have to be hard coded in some machine code to be efficient I guess.
 */

// Let's say TypeScript is AssemblyScript for a while (june 7 2021)
/**/ type u8  = number;
/**/ type u32 = number;
/**/ type i32 = number;


// This code is supposed to be compiled in 32 bits mode. This means that
// all pointers are 32 bits, including pointers returned by malloc() & co.
// There is little need for a 64 bits version at this time (2023). If it were
// to exist, if would make sense to also move cells from 64 bits to 128 bits.

/*c{

// #define USE_INT_ONLY
#ifdef  USE_INT_ONLY
  #define     u8              int
  #define     u32             unsigned int
  #define     i32             int
  #define     u64             unsigned long long
  // Macro to convert an integer into a pointer
  // #define     cast_ptr( p )   ( (int*) (p) )
  #define     cast_ptr( p ) ( reinterpret_cast<u32*>( p ) )
#else
  #define USE_STDINT_H 1
  #ifdef USE_STDINT_H
    #define   u8              uint8_t
    #define   u32             uint32_t
    #define   i32             int32_t
    #define   u64             uint64_t
    #define   cast_ptr( p ) ( (int32_t*) (p) )
  #else
    typedef   unsigned int       u8;
    typedef   unsigned int       u32;
    typedef   int                i32;
    typedef   unsigned long long u64;
    #define   cast_ptr( p ) ( (int*) (p) )
  #endif
#endif

#define boolean bool

}*/

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

// Address in memory of a cell, that's where the value, type and name are stored
// It's a 28 bits index that needz to be << 3 shifted to get a byte pointer
/**/ type    Cell = i32;
//c/ #define Cell   i32

// Address of a dynamically allocated cell, a substype of Cell
/**/ type Area    = i32;
//c/ #define Area   i32

// Smallest entities at an address in memory
/**/ type    InoxWord = i32;
//c/ #define InoxWord   i32

// Index in rather small arrays usually, usually positive
/**/ type    Index = i32;
//c/ #define Index   i32

// A counter, not negative usually
/**/ type    Count = i32;
//c/ #define Count   i32

// Size of something, always in bytes
/**/ type    Size = i32;
//c/ #define Size   i32

// Size in number of items, often cells, never bytes
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

// Payload of cell.
/**/ type    Value = i32;
//c/ #define Value   i32

// Type & name info parts of a cell, packed
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
/**/ type    Text    = string;
/**/ type    MutText = string;

// In C++, we define a custom string class, LeanString
//c/ #define Text       LeanString
//c/ #define MutText    LeanString
//c/ #define TxtD( s )  LeanString( s )

// Like Text, but const
// ToDo: ugly, refactoring needed
/**/ type TxtC        = string;
/**/ type ConstText   = string;
//c/ #define ConstText  const LeanString&
//c/ #define TxtC       const char*

/**/ type            Primitive = () => void;
//c/ typedef void ( *Primitive )( void );

// any is for proxied objects only at this time
// ToDo: RTTI related stuff in some future?
// ToDo: it should be a pointer to an AbstractInoxProxy object
//c/ #define any const void*

//c/ #define null NULL


/* -----------------------------------------------------------------------------
 *  Let's go.
 *   Some debugging tools first.
 *
 *  Defensive programming. It is a style of programming that assumes that the
 *  programmer barely knows what he is doing, and that the code will be used,
 *  modified, and read by other people who are as incompetent than he is.
 *  Coding is still a complex task, and it is not possible to write code that
 *  is 100% correct. Defensive programming is a way to reduce the number of
 *  bugs in the code, and to make it easier to find and fix them.
 *
 *  It can make the code more verbose, but it is a good investment. All veteran
 *  programmers will tell you that the pain is worth it. Yet, some code is just
 *  too complex to handle for most people, and it is not possible to make it
 *  simple enough to be understood by everyone. In that case, defensive is a way
 *  to make the code more robust and to avoid some of the most common bugs.
 *
 *  If this code is too complex for you, don't feel bad. It is too complex for
 *  the author too. It is a work in progress and the code will hopefully get
 *  simpler over time. In the meantime, if you can't stand the heat, get out of
 *  the kitchen. Life is short.
 */

/* ----------------------------------------------------------------------------
 *  How to invoke the debugger from the code
 */

/*c{

#ifdef _WIN32

  #include <intrin.h>
  #define debugger __debugbreak()

#else

  static void debugger_function( void ){
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
 *  Assertion macros
 */

/**/ import { strict as assert } from 'assert';

// In C++, custom assert() macro that avoids using any external library
/*c{

  #define true  1
  #define false 0

  #ifndef INOX_ASSERT_MAX_LENGTH
    #define INOX_ASSERT_MAX_LENGTH 512
  #endif

  static char assert_msg_buffer[ INOX_ASSERT_MAX_LENGTH + 80 ];

  // Forward
  void breakpoint( void );

  bool failed_assert(
    TxtC title,
    TxtC msg,
    TxtC file,
    int line,
    TxtC func
  ){
    strcpy( assert_msg_buffer, "Inox. Assertion failed: " );
    if( title ){
      strcat( assert_msg_buffer, title );
      strcat( assert_msg_buffer, ", " );
    }
    // Get defensive, truncate the message if it is too long
    if ( strlen( msg ) > INOX_ASSERT_MAX_LENGTH ) {
      strncat( assert_msg_buffer, msg, INOX_ASSERT_MAX_LENGTH );
    }else{
      strcat( assert_msg_buffer, msg );
    }
    strcat( assert_msg_buffer, ", file " );
    strcat( assert_msg_buffer, file );
    strcat( assert_msg_buffer, ", line " );
    // Add the line number, char by char, 6 digits
    char* next = assert_msg_buffer + strlen( assert_msg_buffer );
    *next++ = ( line / 100000 ) % 10 + '0';
    *next++ = ( line / 10000 ) % 10 + '0';
    *next++ = ( line / 1000 ) % 10 + '0';
    *next++ = ( line / 100 ) % 10 + '0';
    *next++ = ( line / 10 ) % 10 + '0';
    *next++ = ( line / 1 ) % 10 + '0';
    // Add a null terminator
    *next = 0;
    strcat( assert_msg_buffer, ", function " );
    strcat( assert_msg_buffer, func );
    strcat( assert_msg_buffer, ".\n" );
    write( 2, assert_msg_buffer, strlen( assert_msg_buffer ) );
    breakpoint();
    abort();
    return false;
  }

  #ifdef INOX_FAST
    #define assert( cond )       true
    #define assert2( cond, msg ) true
  #else
    #define assert( b ) \
    ( ( b ) ? true : failed_assert( null, #b, __FILE__, __LINE__, __func__ ) )
    #define assert2( b, msg ) \
    ( ( b ) ? true : failed_assert( msg,  #b, __FILE__, __LINE__, __func__ ) )
  #endif

}*/

/**/ const assert2 = assert;


/* ----------------------------------------------------------------------------
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
 *
 *  Using compilation flags, it is posible to turn "de" and other debug
 *  domains into constants. Then the C++ compiler can remove the calls
 *  and the overhead is reduced to zero.
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
  #define INOX_VERBOSE_STACK_NDE
#endif

// However, /D specified domains can be authorized at compile time

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
 *  This source file uses multiple debug domains, ie categories.
 *  Some of them are purely there for development, some are useful
 *  for production. Some are there to help debug the interpreter itself.
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
 *  'legacy' is a debug domain to help debug issues that tend to reappear
 *  from time to time. It is usefull to debug the interpreter itself.
 *  It should be disabled in production.
 */

/**/ let legacy_de = false;
/*c{
  // In "fast" mode, 'legacy_de' flag cannot be activated at runtime
  #ifdef INOX_FAST
    #define legacy_de false
  #else
    static bool legacy_de = false;
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

/*
 *  'stack_de' enables checks about the stacks. It's useful to debug
 *  changes to the stacks. This flag commands the stack overflow/underflow
 *  checking.
 */

/**/ let stack_de = false;
/*c{
  // In "fast" mode, 'stack' flag cannot be activated at runtime
  #ifdef INOX_STACK_NDE
    #define stack_de false
  #else
    static bool stack_de = false;
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
 *  'verbose_stack_de' enables traces about the stacks. It's useful to debug
 *  changes to the stacks. Note that this flag does not command the
 *  stack overflow/underflow checking, it only enables traces about the stacks.
 */

/**/ let verbose_stack_de = false;
/*c{
  // In "fast" mode, 'verbose_stack' flag cannot be activated at runtime
  #ifdef INOX_VERBOSE_STACK_NDE
    #define verbose_stack_de false
  #else
    static bool verbose_stack_de = false;
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
 *  normal_debug() is normal, no_debug_at_all() is without any checking of
 *  both types and memory, fast but perilous.
 *  The default should normally be normal_debug(). When debugging the
 *  application is sufficient, the confident developper may use fast() to
 *  disable all checks and traces. After some times, if everything is ok
 *  and the code is stable, the developper may use no_debug_at_all() that
 *  comes with the statically compiler fast version of the interpreter.
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
 *  This is the mode when debugging the Inox interpreter itself.
 */

function debug(){
// Maximum debug level
  can_log = true;
  // Enable checks at the very low level of memory management
  /**/ de = mem_de = alloc_de = true;
  // Verbose word compilation, evaluation and running
  /**/ warn_de = true;
  /**/ token_de = parse_de = eval_de = run_de = verbose_stack_de = true;
  // Step by step debugging when running inside a debugger
  /**/ blabla_de = step_de = true;
  /*c{
    #ifndef de
      de = true;
    #endif
    #ifndef mem_de
      mem_de = true;
    #endif
    #ifndef alloc_de
      alloc_de = true;
    #endif
    #ifndef check_de
      check_de = true;
    #endif
    #ifndef warn_de
      warn_de = true;
    #endif
    #ifndef blabla_de
      blabla_de = true;
    #endif
    #ifndef token_de
      token_de = true;
    #endif
    #ifndef parse_de
      parse_de = true;
    #endif
    #ifndef eval_de
      eval_de = true;
    #endif
    #ifndef run_de
      run_de = true;
    #endif
    #ifndef verbose_stack_de
      verbose_stack_de = true;
    #endif
    #ifndef step_de
      step_de = true;
    #endif
  }*/
}


/*
 *  Normal mode, with error checking only, no traces.
 *  This is the mode when debugging an application written in Inox.
 *  It's also the mode when running the application in production unless
 *  the application is fully trusted.
 */

function normal_debug(){
  debug();
  /**/ mem_de = alloc_de = false;
  /**/ blabla_de = false;
  /**/ token_de = parse_de = eval_de = run_de = verbose_stack_de = step_de = false;
  /*c{
    #ifndef mem_de
      mem_de = false;
    #endif
    #ifndef alloc_de
      alloc_de = false;
    #endif
    #ifndef blabla_de
      blabla_de = false;
    #endif
    #ifndef token_de
      token_de = false;
    #endif
    #ifndef parse_de
      parse_de = false;
    #endif
    #ifndef eval_de
      eval_de = false;
    #endif
    #ifndef run_de
      run_de = false;
    #endif
    #ifndef verbose_stack_de
      verbose_stack_de = false;
    #endif
    #ifndef step_de
      step_de = false;
    #endif
  }*/
}


/*
 *  Fast mode, no type checking, no traces. This is the mode when running
 *  the application in production if the application is fully trusted.
 *  It's also the mode when running the application in production if some
 *  orchestration layer monitors the execution and catched errors.
 *  Such a layer would restart the running code in case of error, not
 *  using no_debug_at_all() but normal_debug() instead, so that the error
 *  can be catched and reported with a stack trace and other usefull
 *  information for debugging the next time it happens.
 */

function no_debug_at_all(){
  // Starting from the development mode, disable some very slow domains
  normal_debug();
  // Assume that the application is is type clean, no need to check types
  /**/ de = false;
  /**/ check_de = false;
  /*c{
    #ifndef de
      de = false;
    #endif
    #ifndef check_de
      check_de = false;
    #endif
  }*/
}

let debug_level = 0;


function init_debug_level( level : Index ) : Index {
// Set the initial debug level

  switch( level ){
    case 0:
      // The fatest engine is the C++ one, it can get rid of all checks
      /*c{
        #ifdef INOX_FAST
          no_debug_at_all();
          return 0;
        #endif
      }*/
      // Case where all domains are disabled, semantically identical
      no_debug_at_all();
    break;

    case 1:
      // Case where only type checking & stacj checking are still there
      normal_debug();
    break;

    case 2:
      // Next commes the case where more debugging is enabled
      debug();
      /**/ token_de = false;
      /**/ parse_de = false;
      /*c{
        #ifndef token_de
          token_de = false;
        #endif
        #ifndef parse_de
          parse_de = false;
        #endif
      }*/
    break;

    case 3:
      // Next commes the case where more debugging is enabled
      debug();
      /**/ token_de = false;
      /*c{
        #ifndef token_de
          token_de = false;
        #endif
      }*/
    break;

    case 4:
      debug();
    break;

    default:
      // The default case is the most verbose one
      debug();
      level = 4;
  }

  debug_level = level;
  return level;

}

/*c{
  #ifdef INOX_FAST
    static Index init_debug_level_done = init_debug_level( 0 );
  #else
    static Index init_debug_level_done = init_debug_level( INOX_DEBUG_LEVEL );
  #endif
}*/
/**/ const init_debug_level_done = init_debug_level( INOX_DEBUG_LEVEL );


/* ----------------------------------------------------------------------------
 *  Forward declarations to please C++. The functions are defined later.
 *  In TypeScript references to functions can be used before they are defined.
 *  Note: in Inox, verbs must be defined before they are used.
 */

// Forward declarations to please C++
/*c{
static bool  mand_eq( Value, Value );
static bool  mand_neq( Value, Value );
static bool  mand_type( Type, Type );
static bool  mand_cell_type( Cell, Type );
static bool  mand_cell_name( Cell, Tag );
static bool  mand_empty_cell( Cell );
static bool  mand_tos_is_in_bounds( void );
static bool  mand_csp_is_in_bounds( void );
static bool  mand_stacks_are_in_bounds( void );
static bool  trace( char* );
static void  trace_context( TxtC );
static void  FATAL( TxtC msg );
static int   init_cell_allocator( void );
static Cell  allocate_cell( void );
static Cell  allocate_cells( Count );
static void  cell_free( Cell );
static void  cells_free( Cell, Count );
static int   init_area_allocator( void );
static Size  area_aligned_size( Size );
static Area  allocate_area( Count );
static bool  area_is_shared( Cell );
static void  area_lock( Area );
static void  area_free( Area );
static void  lean_lock( Area );
static bool  area_is_safe( Area );
static bool  area_is_busy( Area );
static Size  area_size( Area );
static void  area_turn_free( Area, Area );
static void  area_turn_busy( Area, Size );
static void  area_init_busy( Area, Size );
static void  area_set_size( Area, Size );
static Count area_length( Area );
static void  set_next_cell( Cell, Cell );
static Cell  tag( TxtC );
static bool  tag_is_valid( Tag );
static bool  is_a_tag_cell( Cell );
static bool  is_a_tag_singleton( Cell );
static bool  is_a_reference_cell( Cell );
static bool  is_a_reference_type( Type );
static void  init_cell( Cell, Value, Info );
#define set( c, t, n, v )  init_cell( c, v, pack( t, n ) )
static void  move_cell( Cell, Cell );
static void  clear( Cell );
static Index object_length( Area );
static void  object_free( Area );
static void  text_free( Cell );
static void  proxy_free( Index );
static Area  reference_of( Cell );
static bool  is_sharable( Cell );
static Cell  stack_preallocate( Length );
static Count stack_length( Cell );
static bool  stack_is_extended( Cell );
static void  stack_push( Cell, Cell );
static void  stack_put( Cell, Index, Cell );
static void  stack_put_copy( Cell, Index, Cell );
static Cell  stack_at( Cell, Index );
static void  stack_extend( Cell, Length );
static bool  cell_looks_safe( Cell );
static void  set_return_cell( Cell );
static Cell  PUSH( void );
static Cell  POP( void );
static void  push_integer( Value );
static Cell  make_proxy( any );
static void  set_proxy_cell( Cell, Cell );
static void  primitive_clear_control( void );
static void  primitive_clear_data( void );
static Cell  definition_of( Tag );
static Tag   type_to_tag( Type );
static Type  tag_to_type( Tag );
static Count block_length( Cell );
static void  primitive_if( void );
static void  primitive_run( void );
static void  primitive_noop( void );
static void  set_style( TxtC );
static void  eval_do_literal( void );
static void  eval_do_machine_code( Tag );
static void  eval_quote_next_token( void );
static bool  eval_is_expecting_the_verb_name( void );
static void  process_comment_state( void );
static void  process_word_state( void );
static bool  parsing( Index );
static Primitive get_primitive( Tag );

}*/

/* -----------------------------------------------------------------------------
 *  The Inox interpreter's memory inside the CPU's one.
 *  The TypeScript version uses a single big ArrayBuffer.
 *  The C++ version uses calloc() linked chunks.
 */

// This is "the data segment" of the virtual machine.
// the "void" first cell is allocated at absolute address 0.
// It's an array of 64 bits words indexed using 28 bits addresses.
// That's a 31 bits address space, 2 giga bytes, plenty.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html


/*c{
  #ifdef __CHEERP__
    #undef INOX_HEAP_SIZE
    #define INOX_HEAP_SIZE   1024 * 1024  // 1 MB
  #endif
}*/

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
let the_cell_limit = 0;

// The memory is accessed differently depending on the target
/**/ let mem    = new ArrayBuffer( INOX_HEAP_SIZE  );
/**/ let mem8   = new Uint8Array(     mem );
/**/ let mem32  = new Int32Array(     mem );
/**/ let mem32f = new Float32Array(   mem );
/**/ let mem64  = new BigUint64Array( mem );
// ToDo: with AssemblyScript const mem64 = new Int64Array( mem );

// Linked list of free byte areas, see init_area_allocator()
let the_first_free_area = 0;

let the_empty_text_cell = 0;

// Having a tempory cell is convenient sometimes
let the_tmp_cell = 0;

// A few global variables need to be initialized soon.
// That's mainly for debugging purposes.
// They are documented better close to where they are used.
let all_symbol_cells = 0;
let all_symbol_cells_length = 0;

// Precomputed value for /list. It's needed early to manage the cells allocator
/**/ const tag_list = 10;
//c/ #define tag_list 10


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

static bool trace( char* msg ){
  if( !can_log )return true;
  // 1 is stdout
  int len = strlen( msg );
  msg[ len ] = '\n';
  write( 1, msg, len + 1 );
  return true;
}

// Hack to avoid a strange recursive call to trace() in C++
bool trace_c_str( char* msg ){
  return trace( msg );
}

// Ultra safe version of trace() that can be used in any context
static bool trace_const_c_str( const char* msg ){
  write( 1, msg, strlen( msg ) );
  return true;
}

}*/


/**/ let bootstrapping         = true;
//c/ static bool bootstrapping = true;

function breakpoint(){
  debugger;
  if( bootstrapping )return;
  trace_context( "BREAKPOINT\n" );
  debugger;
}


/* ----------------------------------------------------------------------------
 *  'mand' is short for "demand" or "mandatory". It's functions that check
 *  if some condition is true. If it's not, it raises an exception. This
 *  implements assertions checking.
 *  There are various flavors of mand() to check various types of conditions.
 */


/**/ const   mand  = ( b    ) => ( assert(  b    ), true );
/**/ const   mand2 = ( b, m ) => ( assert(  b, m ), true );
//c/ #define mand(     b    )    ( assert(  b    )       )
//c/ #define mand2(    b, m )    ( assert2( b, m )       )

// Hack to avoid a strange recursion
/*c{
static bool mand2_c_str( bool condition, char* msg ){
  return mand2( condition, msg );
}
}*/


/* -----------------------------------------------------------------------------
 *  First, make it work in the javascript machine, it's the portable scheme.
 *  When compiled using AssemblyScript some changes will be required.
 */

/**/ de&&bug( "Inox is starting." );


/* -----------------------------------------------------------------------------
 *  Endianess. Sometimes, rarely, code depends on the order of bytes in memory.
 *  It is the case for the RUN() function that must be highly optimized.
 *  For that function, and similar ones that depend on the order of bytes, code
 *  is duplicated, with a special version for each endianess.
 *  For example, regarding the byte order for an Inox value, the order is:
 *    - cell's value, 4 bytes, a 32 bits integer
 *    - cell's type and named, 4 bits for the type, 28 bits for the name.
 *  Currently, the type is stored in the 4 most significant bits, and the name
 *  in the 28 least significant bits. The name is an index in the symbol table.
 *  Question: in which byte is the type stored? It has to be in range [4,7]
 *  because range [0,3] is for the value. So, if the machine is little endian,
 *  the type is in the 4th byte, and if it is big endian, the type is in the
 *  7th byte. That's quite a difference, and that's why we need to know the
 *  endianess of the machine.
 *  The current implementation only works for little endian machines. That
 *  is the case for x86 and x86_64, but not for ARM. So, for ARM, we need to
 *  change the order of bytes in the type/name field. This is done in the
 *  functions pack_info() and unpack_info() together with the functions
 *  type_of() and name_of().
 */

/*c{
  #ifndef INOX_IS_BIG_ENDIAN
    #define INOX_IS_LITTLE_ENDIAN 1
  #else
    #define INOX_IS_LITTLE_ENDIAN 0
  #endif
}*/

/*ts{*/
const INOX_IS_LITTLE_ENDIAN = 1;
/*}*/



function is_little_endian() : Index {
// Return 1 if the machine is little endian, 0 if it is big endian

  // Typescript version
  /*ts{*/
    let u32 = new Uint32Array( [ 0x11223344 ] );
    let u8  = new Uint8Array( u32.buffer );
    if( u8[ 0 ] === 0x44 ){
      return 1;
    }else{
      return 0;
    }
  /*}*/

  // C version
  /*c{

    u32 v32           = 0x12345678;
    u8* p32           = (u8*) &v32;
    u8  first_byte_32 = p32[ 0 ];

    // Where is the highest byte in a 32 bits integer?
    Index highest_byte_position_in_32 = 0;
    for( int ii = 0; ii < 8; ii++ ){
      if( p32[ ii ] == 0x12 ){
        highest_byte_position_in_32 = ii;
        break;
      }
    }

    u64 v64           = 0x1122334455667788;
    u8* p64           = (u8*) &v64;
    u8  first_byte_64 = p64[ 0 ];

    // Where is the highest byte in a 64 bits integer?
    Index highest_byte_position_in_64 = 0;
    for( int ii = 0; ii < 8; ii++ ){
      if( p64[ ii ] == 0x11 ){
        highest_byte_position_in_64 = ii;
        break;
      }
    }

    bool is_little_endian = first_byte_32 == 0x78;

    assert( !is_little_endian || highest_byte_position_in_32 == 3 );
    assert(  is_little_endian || highest_byte_position_in_32 == 0 );
    assert( !is_little_endian || highest_byte_position_in_64 == 7 );
    assert(  is_little_endian || highest_byte_position_in_64 == 0 );

    // Funny fact: when is_little_endian, at the end there is, guess what?
    // ... the highest byte. So it does not end little, it ends big.
    // That's rather confusing, but it's the way it is.

    if( is_little_endian ){
      assert( first_byte_64 == 0x88 );
      return 1;
    }else{
      assert( first_byte_64 == 0x11 );
      return 0;
    }
  }*/

}


function check_endianess() : Index {
  const it_is = is_little_endian();
  if( it_is != INOX_IS_LITTLE_ENDIAN ){
    FATAL(
      "Inox does not support big endian machines yet."
    );
  }
  return 1;
}
const check_endianes_done = check_endianess();


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
let breakpoint_cell = 0;

function mand_cell_in_range( c : Cell ) : boolean {
  if( c >= 0
  && c >= the_very_first_cell
  /**/ && ( ( c << 1 ) + 1 ) < mem32.length
  //c/ && ( ( c << 1 ) + 1 ) < ( the_cell_limit << 1 )
  ){
    if( de && c == breakpoint_cell && c != 0 )debugger;
    return true;
  }
  const target32 = ( c << 1 ) + 1;
  const c16 = c;
  const c32 = c << 1;
  const c8  = c << 3;
  /**/ const limit32 = mem32.length;
  //c/ int limit32 = the_cell_limit << 1;
  const limit8  = limit32 << 3;
  let overflow32 = 0;
  if( target32 >= limit32 ){
    /**/ overflow32 = ( c32 - mem32.length  ) + 1;
    //c/ overflow32 = ( c32 - ( the_cell_limit << 1 ) ) + 1;
  }
  const overflow8 = overflow32 << 2;
  const overflow64 = overflow32 >> 1;
  const overflow_cells = overflow64;
  const overflow_bytes = overflow8;
  if( de && c == breakpoint_cell ){
    debugger;
  }else{
    debugger;
  }
  return false;
}


/*
 *  set_value() and set_info() are the only way to write to memory
 */

function set_value( c : Cell, v : Value ){
   if( de && c == breakpoint_cell )debugger;
   mem_de&&mand_cell_in_range( c );
   /**/ mem32[ c << 1 ] = v |0;
   //c/ *cast_ptr( to_ptr( c ) ) = v;
}


function set_info( c : Cell, i : Info  ){
  mem_de&&mand_cell_in_range( c );
  /**/ mem32[ ( c << 1 ) + 1 ] = i |0;
  //c/ *cast_ptr( to_ptr( c ) + size_of_value ) = i;
}


/*
 *  value_of() and info_of() are the only way to read from memory
 */

function value_of( c : Cell ) : Value {
  mem_de&&mand_cell_in_range( c );
  // return mem64[ c ] & 0xffffffff
  /**/ return mem32[ c << 1 ] |0;
  //c/ return *cast_ptr( to_ptr( c ) );
}


function info_of( c : Cell ) : Info {
  mem_de&&mand_cell_in_range( c );
  // return mem64[ c ] >>> 32;
  /**/ return mem32[ (     c << 1 ) + 1 ] |0;
  //c/ return *cast_ptr( to_ptr( c ) + size_of_value );
}


/*
 *  reset() is the way to clear a cell
 */

function reset( c : Cell ){
  mem_de&&mand_cell_in_range( c );
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
  mem_de&&mand_cell_in_range( c );
  /**/ mem32[     c << 1 ] = 0;
  //c/ *cast_ptr( to_ptr( c ) ) = 0;
}


/*
 *  reset_info()
 */

function reset_info( c : Cell ) : void {
  mem_de&&mand_cell_in_range( c );
  /**/ mem32[     ( c << 1 ) + 1 ] = 0;
  //c/ *cast_ptr( ( to_ptr( c ) ) + size_of_value ) = 0;
}


/*
 *  init_cell() to initialize a cell to zeros
 */

function init_cell( c : Cell, v : Value, i : Info ){
  mem_de&&mand_cell_in_range( c );
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
// Initialize a cell, using another one, raw copy
  mem_de&&mand_cell_in_range( dst );
  mem_de&&mand_cell_in_range( src );
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
 *  packing and unpacking of the type and name of a cell
 */

/*ts{*/

function pack( t : Type, n : Tag ) : Info {
  return n | t << 28;
}


function unpack_type( i : Info ) : Type {
  return i >>> 28;
}


function unpack_name( i : Info ) : Tag {
  return i & 0xffffff;
}


function type_of( c : Cell ) : Type {
  return unpack_type( info_of( c ) );
}


function name_of( c : Cell ): Tag {
  return unpack_name( info_of( c ) );
}

/*}*/

/*c{

#define pack( t, n )       ( ( n ) | ( ( t ) << 28 ) )
#define unpack_type( i )   ( ( ( u32) i ) >> 28 )
#define unpack_name( i )   ( ( i ) & 0xffffff )
#define type_of( c )       ( unpack_type( info_of( c ) ) )
#define name_of( c )       ( unpack_name( info_of( c ) ) )

}*/

/*
 *  set_type() and set_name()
 */

function set_type( c : Cell, t : Type ){
  // The type of the singleton tag cell that defines the tag must never change
  if( legacy_de && is_a_tag_cell( c ) && is_a_tag_singleton( c ) ){
    // Tag void is the exception, it's type is 0, aka void.
    if( c == 0 ){
      mand_eq( t, 0 );
    }else{
      mand_eq( t, 1 );
    }
  }
  set_info( c, pack( t, unpack_name( info_of( c ) ) ) );
}


function set_name( c : Cell, n : Tag ){
  // The name of the tag cell that defines the tag must never change
  if( legacy_de && type_of( c ) == 2 /* type_tag */ && c == value_of( c ) ){
    mand_eq( n, c );
  }
  set_info( c, pack( unpack_type( info_of( c ) ), n ) );
}

/*
 *  small test suite for pack() and unpack()
 */

/*ts{*/

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
  de&&mand( value_of( test_cell ) == 0 );
  set_value( test_cell, 1 );
  de&&mand( value_of( test_cell ) == 1 );
  set_info( test_cell, 0 );
  de&&mand( info_of(  test_cell ) == 0 );
  set_info( test_cell, 1 );
  de&&mand( info_of(  test_cell ) == 1 );
  init_cell( test_cell, 0, 0 );
  de&&mand( value_of( test_cell ) == 0 );
  de&&mand( info_of(  test_cell ) == 0 );
  init_cell( test_cell, 1, 1 );
  de&&mand( value_of( test_cell ) == 1 );
  de&&mand( info_of(  test_cell ) == 1 );
  init_cell( test_cell, 0, 1 );
  de&&mand( value_of( test_cell ) == 0 );
  de&&mand( info_of(  test_cell ) == 1 );
  init_cell( test_cell, 1, 0 );
  de&&mand( value_of( test_cell ) == 1 );
  de&&mand( info_of(  test_cell ) == 0 );
  reset( 0 );
  de&&mand( value_of( test_cell ) == 0 );
  de&&mand( info_of(  test_cell ) == 0 );
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


// When some IP is store in the control stack, it is stored as a verb
/**/ const   type_ip = type_verb
//c/ #define type_ip   type_verb


/* -----------------------------------------------------------------------------
 *  LeanString implementation.
 *  This is a minimal implementation of dynamiccally allocated strings.
 *  It is for all versions, both TypeScript, AssemblyScript and C++.
 *  It initially stores the strings using allocate_cells() and then moves to
 *  using allocate_area() as soon as possible during bootstrap.
 *
 *  Each lean string is made of a two cells header plus the bytes of
 *  the string plus one byte set to 0 for C string compatibility when needed.
 *  That's a total of 3 cells for a string of 0 to 7 bytes and then
 *  another cell for each consecutive 8 bytes.
 *
 *  Note: using a common format for strings makes it possible to communicate
 *  between the C++, TypeScript and the AssemblyScript version with ease.
 *  That the string representation is also C compatible makes it easy to
 *  interface Inox with C code.
 *
 *  ToDo: LeanStringView object that would be a view on a portion of a string.
 *  It needs a pointer to the string area and a length.
 *  One easy way to distinguish a LeanString from a LeanStringView is to
 *  check the high bit of the address of the string. If set, it's a view.
 *  In that case, the length could be stored either in an additional cell, or
 *  more complex but more memory efficient, in the info part of the cell.
 *  This would require a special type however, unless void can be used for
 *  that when the high bit is set. This impacts the unpacking of the info
 *  because it requires access to the value to check the high bit. This
 *  is necessary only when the name is usefull in a context where it is
 *  not sure that the cell is a "normal" cell or a LeanStringView cell.
 *  This is the case in various dump functions and other debugging tools.
 *  Another option is to use the range type with a range that is bound
 *  to the underlying string. This is a bit more complex to implement
 *  but more general maybe.
 *
 *  ToDo:
 *  It should handle UTF-8, UTF-16, UTF-32, etc.
 *  It is actually more a buffer than a string.
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
 *
 *  About sentinels.
 *  Sentinels are special values used to detect the end of something.
 *  This is an alternative to using a length field.
 *  C style strings use a sentinel, the null byte. As a result, it is
 *  impossible to store a null byte in a C style string. Inox strings
 *  don't have that limitation but it still applies when interfacing with
 *  C style strings. See https://en.wikipedia.org/wiki/Sentinel_value
 */

// To avoid some infinite loops in assertion failure tracing
let mand_entered = 0;

// Declared here to avoid access before initialization
let debug_next_allocate = 0;

// Linked list of free cells.
let the_first_free_cell = 0;

// The basic cell allocator is needed, let's initialize it now
const init_cell_allocator_done = init_cell_allocator();

// Some early declarations to avoid access before initialization

// The first cell of a busy byte area header is the reference counter
// This is precomputed, see init_symbols()
/**/ const tag_dynamic_ref_count = 17;
//c/ #define tag_dynamic_ref_count 17

// When the area is freed, that header is overwritten with this tag
// This is precomputed, see init_symbols()
/**/ const tag_dynamic_next_area = 18;
//c/ #define tag_dynamic_next_area 18

// The second cell of the header is the size of the area, including the header
// This is precomputed, see init_symbols()
/**/ const tag_dynamic_area_size = 16;
//c/ #define tag_dynamic_area_size 16

// This is where to find the size, relative to the area first header address.
const offset_of_area_size = ONE;


// There is a special empty string
//c/ static Cell lean_init_empty( void ); // Forward
const the_empty_lean = lean_init_empty();

//c/ static Cell lean_allocate_cells_for_bytes( Length ); // Forward

function lean_init_empty() : Cell {
  de&&mand( bootstrapping );
  const cell = lean_allocate_cells_for_bytes( 1 );
  return cell;
}


//c/ static bool lean_is_valid( Cell ); // Forward
//c/ static Length lean_strlen( Cell ); // Forward

function lean_is_empty( area : Area ) : boolean {
  if( area == the_empty_lean ){
    return true;
  }
  // Only the empty lean string is empty
  if( alloc_de ){
    mand( lean_is_valid( area ) );
    const len = lean_strlen( area );
    mand_neq( len, 0 );
  }
  return false;
}


function lean_new_empty() : Area {
// Return a reference to the empty lean string
  // ToDo: no need to lock it because it is never freed
  // area_lock( the_empty_lean );
  return the_empty_lean;
}


function lean_aligned_cell_length( len : Length ) : Length {
// Return how many cells to store bytes. Headers excluded, payload only
  // Add padding to align on the size of cells
  const padded_len = ( len + size_of_cell - 1 ) & ~( size_of_cell - 1 );
  // Divide by the size of cells to get the number of cells
  return to_cell( padded_len );
}


function lean_to_header( area : Area ) : Area {
// The header is two cells before the payload
  // Header is made of a reference counter and a size
  return area - 2 * ONE;
}


//c/ static Value lean_unchecked_byte_at( Cell, Index ); // Forward

function lean_is_valid( area : Area ) : boolean {
// Check that a cell is a valid lean string
  if( !area_is_busy( area ) )return false;
  const size =  value_of( lean_to_header( area ) + 1 * ONE ) - 2 * size_of_cell;
  if( size <= 0 )return false;
  // Check that there is a null terminator
  if( lean_unchecked_byte_at( area, size - 1 ) != 0 )return false;
  // If size is 1 then it is a null terminator alone, ie the_empty_lean
  if( size != 1 )return true;
  return area == the_empty_lean;
}


function lean_allocate_cells_for_bytes( sz : Size ) : Area {
// Allocate cells to store a string of len bytes, including the null terminator

  // At least one bye is needed, for the null terminator
  alloc_de&&mand( sz > 0 );

  if( !bootstrapping )return allocate_area( sz );

  // During bootstrap, the byte area allocator is not yet available
  let needed_cells = lean_aligned_cell_length( sz );

  // Add space for the headers to fake a byte area
  needed_cells += 2;
  const header = allocate_cells( needed_cells );

  // Header 0 is a reference counter
  set_info(  header + 0 * ONE, pack( type_integer, tag_dynamic_ref_count ) );
  set_value( header + 0 * ONE, 1 );

  // Header 1 is total size in bytes, including the two headers, aligned
  set_info(  header + 1 * ONE, pack( type_integer, tag_dynamic_area_size ) );
  set_value( header + 1 * ONE, 2 * size_of_cell + sz );

  // The convention is to address the first byte of the payload
  const area = header + 2 * ONE;

  alloc_de&&mand( area_is_busy( area ) );

  return area;

}


function lean_lock( area : Area ){
  area_lock( area );
}


function lean_free( area : Area ){

  // No need to unshare the empty string, it will never be freed
  if( area == the_empty_lean ){
    return;
  }

  // Is it the last reference to the string?
  if( area_is_shared( area ) ){
    // No, just decrement the reference counter
    area_free( area );
    return;
  }

  // Should never free the empty string
  if( area == the_empty_lean ){
    //c/ trace_const_c_str( "Internal error, free the empty lean string\n" );
    /**/ debugger;
    return;
  }
  alloc_de&&mand_neq( area, the_empty_lean );

  // Clear the content of the string
  const ncells = area_length( area );
  const limit  = area + ncells * ONE;
  let ii = area;
  // ToDo: optimize this in C++ by using memset()
  while( ii < limit ){
    reset( ii );
    ii += ONE;
  }

  area_free( area );

}


function lean_unchecked_byte_at( cell : Cell, index : Index ) : Value {
  // TypeScript version uses the mem8 view on the memory buffer
  /**/ return mem8[ to_ptr( cell ) + index ];
  // AssemblyScript version uses the load<u8> function
  //a/ return load<u8>( to_ptr( cell ) + index );
  // C++ version uses the memory buffer directly
  //c/ return *(char*)  ( to_ptr( cell ) + index );
}


function lean_byte_at( area : Area, index : Index ) : Value {
  if( alloc_de ){
    mand( lean_is_valid( area ) );
    mand( index >= 0 );
    mand( index < lean_strlen( area ) );
  }
  return lean_unchecked_byte_at( area, index );
}


function lean_byte_at_put( area : Cell, index : Index, val : Value ){
// Set a byte at some position inside a byte area
  // TypeScript version uses the mem8 view on the memory buffer
  /**/ mem8[ to_ptr( area ) + index ] = val & 0xFF;
  // AssemblyScript version uses the store<u8> function
  //a/ store<u8>( to_ptr( cell ) + index, val & 0xFF );
  // C++ version uses the memory buffer directly
  // On ESP32, some memory regions are not byte adressable,
  // hence the bytes should be inserted into the 32 bits word
  //c/ *(char*) ( to_ptr( area ) + index ) = val & 0xFF;
  alloc_de&&mand_eq( lean_byte_at( area, index ), val );
}


function lean_byte_at_from( dst : Area, d_i : Index, src : Area, s_i : Index ){
// Copy a byte from a byte area to another one
  // TypeScript version uses the mem8 view on the memory buffer
  /**/ mem8[      to_ptr( dst ) + d_i ] = mem8[      to_ptr( src ) + s_i ];
  // AssemblyScript version uses the store<u8> function
  //a/ store<u8>( to_ptr( dst ) + d_i,    load<u8>(  to_ptr( src ) + s_i ) );
  // C++ version uses char pointers directly
  //c/ *(char*) ( to_ptr( dst) + d_i )  = *(char*) ( to_ptr( src ) + s_i );
}

//c/ static Size area_payload_size( Cell ); // Forward

function lean_strlen( area : Area ) : Length {
// Return the length of a lean string
  alloc_de&&mand( lean_is_valid( area ) );
  // Fast path for empty strings
  if( area == the_empty_lean )return 0;
  // Don't include the null terminator
  return area_payload_size( area ) - 1;
}


function lean_new_from_native( str : TxtC ) : Area {
// Create a lean copy of a native string

  // ToDo: there is room for optimization here:
  // - when size is small, store the string in the header
  // There could be a flag in the last byte of the header to indicate that,
  // after the null byte. Strings from 0 to 6 bytes could be stored
  // that way.
  // - When the size is even shorter a "by value" scheme is possible.
  // Implementation would depend on the architecture endianness.
  // In the best case, strings from 0 to 2 bytes could be stored that way
  // and still be null terminated (hence C compatible).
  // - When a string is a substring of another one, it could be stored
  // as a pointer to the other one, with an offset and a length. This
  // require a copy on write mechanism.
  // - To speed up concatenation, there could be some preallocated space
  // filled with null bytes at the end of the string. This would
  // reduce the number of allocations. Note: there is some padding to reuse.
  // - When the string is anticipated to be very big, it could be implemented
  // as a "rope", see https://en.wikipedia.org/wiki/Rope_(data_structure)

  // TypeScript version:
  /*ts{*/

    // If empty, reuse the empty lean string
    if( str.length == 0 ){
      return lean_new_empty();
    }

    // Convert using a TextEncoder, utf-8 is the default encoding
    // ToDo: figure a way to avoid the tempory buffer
    const encoder = new TextEncoder();
    const buf = encoder.encode( str );

    // Get the byte length of the string
    const str_len = buf.length;

    // Allocate space to store the bytes, + 1 for the null terminator
    const area = lean_allocate_cells_for_bytes( str_len + 1 );

    // Copy the bytes, via a transient view
    const view = new Uint8Array( mem, to_ptr( area ), str_len + 1 );
    view.set( buf );

  /*}*/

  // C++ version uses fast memcpy(), the destination is filled with 0 bytes
  /*c{
    Count str_len = strlen( str );
    if( str_len == 0 )return lean_new_empty();
    Area area = lean_allocate_cells_for_bytes( str_len + 1 );
    memcpy( (char*) ( (int) to_ptr( area ) ), str, str_len );
  }*/

  // ToDo: AssemblyScript version

  alloc_de&&mand_eq( lean_strlen( area ), str_len );
  return area;
}


function lean_to_native( area : Area ) : TxtC {
// Create a native string from a lean string. Shared representations.

  if( alloc_de ){
    // Check that the cell is a valid lean string
    alloc_de&&mand( lean_is_valid( area ) );
  }

  // C++ version is simple, it's already a compatible native string
  /*c{
    return (char*) to_ptr( area );
  }*/

  /*ts{*/
    // Return the empty string?
    if( area == the_empty_lean )return "";
    // ToDo:: optimize this a lot, using a Javascript TextDecoder
    const len = lean_strlen( area );
    let str = "";
    for( let ii = 0; ii < len; ii++ ){
      str += String.fromCharCode( lean_byte_at( area, ii ) );
    }
    return str;
  /*}*/

}


function lean_streq( area1 : Area, area2 : Area ) : boolean {
// Compare two lean strings for equality

  // Check that the two cells are valid lean strings
  alloc_de&&mand( lean_is_valid( area1 ) );
  alloc_de&&mand( lean_is_valid( area2 ) );

  // Exact same addresses?
  if( area1 == area2 )return true;

  // First check the number of bytes, if not the same, not equal
  const nbytes = area_payload_size( area1 );
  if( nbytes != area_payload_size( area2 ) ){
    return false;
  }

  // It's a non empty string, check the content
  alloc_de&&mand( nbytes > 1 );

  /*  // Same size. If empty, they are equal
  if( alloc_de && nbytes == 1 ){
    // This should never happen because the empty string is shared
    debugger;
    // It should be null terminated
    alloc_de&&mand_eq( lean_byte_at( area1, 0 ), 0 );
    // It should be the same cell, the empty one
    alloc_de&&mand_eq( area1, the_empty_lean );
    return true;
  }
  */

  // Adjust size, aligned on size of cell, also skip null terminator
  const sz = ( ( nbytes - 1 ) + size_of_cell - 1 ) & ~( size_of_cell - 1 );

  // Check the content, 8 bytes at a time where possible

  /*c{
    u64* start_ptr = reinterpret_cast< u64* > to_ptr( area1 );
    u64* end_ptr = start_ptr + sz;
    u64* other_ptr = reinterpret_cast< u64* > to_ptr( area2 );
    while( start_ptr < end_ptr ){
      if( *start_ptr != *other_ptr )return false;
      start_ptr += size_of_cell;
      other_ptr += size_of_cell;
    }
  }*/

  /*ts{*/
    let a = area1;
    let b = area2;
    const length = sz / size_of_cell;
    for( let ii = 0 ; ii < length ; ii++ ){
      // ToDo: optimize this using 64 bits words when possible
      if( value_of( a ) != value_of( b ) ){
        return false;
      }
      if( info_of( a ) != info_of( b ) ){
        return false;
      }
      // Move to next cells
      a = a + ONE;
      b = b + ONE;
    }
  /*}*/

  // All cells are equal
  return true;

}


/*c{
static bool lean_streq_with_c_str( Cell cell1, TxtC str ){
// Compare a lean string with a native string

  if( cell1 == the_empty_lean ){
    return str[ 0 ] == 0;
  }

  const len1 = lean_strlen( cell1 );
  const len2 = strlen( str );
  if( len1 != len2 ){
    return false;
  }

  return memcmp( (char*) to_ptr( cell1 ), str, len1 ) == 0;

}

}*/


function lean_strcmp( cell1 : Cell, cell2 : Cell ) : Value {
// Compare two lean strings, return -1, 0 or 1 depending on order

  // TypeScript version
  /*ts{*/
    const len1 = lean_strlen( cell1 );
    const len2 = lean_strlen( cell2 );
    const len = len1 < len2 ? len1 : len2;
    for( let ii = 0; ii < len; ii++ ){
      const byte1 = lean_byte_at( cell1, ii );
      const byte2 = lean_byte_at( cell2, ii );
      if( byte1 < byte2 ){
        return -1;
      }else if( byte1 > byte2 ){
        return 1;
      }
    }
    // It both strings start with the same bytes, the shortest one is first
    if( len1 < len2 ){
      return -1;
    }else if( len1 > len2 ){
      return 1;
    }
    return 0;
  /*}*/

  // C++ version uses strncmp()
  // ToDo: is it correct or should it be strcmp()?
  /*c{
    auto len1 = lean_strlen( cell1 );
    auto len2 = lean_strlen( cell2 );
    auto r = memcmp(
      (char*) to_ptr( cell1 ),
      (char*) to_ptr( cell2 ),
      len1 < len2 ? len1 : len2
    );
    if( r < 0 )return -1;
    if( r > 0 )return 1;
    if( len1 < len2 )return -1;
    if( len1 > len2 )return 1;
    return 0;
  }*/
}


function lean_new_from_strcat( area1 : Area, area2 : Area ) : Area {
// Concatenate two lean strings, returns a new string

  // Deal with the empty strings
  const len1 = lean_strlen( area1 );
  if( len1 == 0 ){
    lean_lock( area2 );
    return area2;
  }

  const len2 = lean_strlen( area2 );
  if( len2 == 0 ){
    lean_lock( area1 );
    return area1;
  }

  // Add one for the final null terminator
  const len = len1 + len2 + 1;

  // Allocate the needed cells
  const new_area = lean_allocate_cells_for_bytes( len );

  // C++ version uses fast memcpy()
  /*c{
    memcpy(
      (char*) to_ptr( new_area ),
      (char*) to_ptr( area1 ),
      len1
    );
    memcpy(
      (char*) to_ptr( new_area ) + len1,
      (char*) to_ptr( area2 ),
      len2
    );
  }*/

  // TypeScript version copy each character
  /*ts{*/
    let ii = 0;
    // Copy the first string
    while( ii < len1 ){
      lean_byte_at_from( new_area, ii, area1, ii );
      ii++;
    }
    // Copy the second string
    let jj = 0;
    while( ii < len ){
      lean_byte_at_from( new_area, ii, area2, jj );
      ii++;
      jj++;
    }
  /*}*/

  alloc_de&&mand_eq( lean_strlen( new_area ), len - 1 );
  return new_area;

}


function lean_strindex( target : Cell, pattern : Cell ) : Value {
// Find the first occurence of str2 in str1

  // ToDo: fast C++ version
  const len_target  = lean_strlen( target );
  const len_pattern = lean_strlen( pattern );

  // Can't find big in small
  if( len_pattern > len_target )return -1;

  // Loop over the target
  let ii = 0;
  let jj = 0;
  let last_possible = len_target - len_pattern;
  for( ii = 0 ; ii <= last_possible ; ii++ ){
    // Check if the first character matches
    if( lean_byte_at( target, ii ) == lean_byte_at( pattern, 0 ) ){
      // Loop over the rest of the pattern
      for( jj = 1 ; jj < len_pattern; jj++ ){
        // Check if the characters match
        if( lean_byte_at( target, ii + jj ) != lean_byte_at( pattern, jj ) ){
          break;
        }
      }
      // Check if the second string was found
      if( jj == len_pattern ){
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

  const len_target = lean_strlen( target );
  const len_pattern = lean_strlen( pattern );

  // Can't find big in small
  if( len_pattern > len_target )return -1;

  // Loop over the target, starting at the end
  for( ii = len_target - 1 ; ii >= 0 ; ii-- ){
    // Check if the first character matches
    if( lean_byte_at( target, ii ) == lean_byte_at( pattern, 0 ) ){
      // Loop over the rest of the pattern
      for( jj = 1 ; jj < len_pattern; jj++ ){
        // Check if the characters match
        if( lean_byte_at( target, ii + jj ) != lean_byte_at( pattern, jj ) ){
          break;
        }
      }
      // Check if the second string was found
      if( jj == len_pattern ){
        return ii;
      }
    }
  }
  return -1;
}


function lean_substr( str : Cell, start : Value, len : Value ) : Cell {
// Extract a substring from a lean string, return a new string

  // If past the end, return an empty string
  const str_len = lean_strlen( str );
  if( start >= str_len ){
    return lean_new_empty();
  }

  // Truncate the length if needed
  if( start + len > str_len ){
    len = str_len - start;
  }

  // If the substring is empty, return an empty string
  if( len == 0 ){
    return lean_new_empty();
  }

  // ToDo: if big enough, share the string
  // This requires to detect that cstr points to a substring.
  // It also means that .c_str() must turn the substring into
  // a full string, null terminated, ie stop sharing.
  // This is worth the trouble once lean mode is stable.
  // See comments about short string optimization.

  // Allocate the result
  const new_area = lean_allocate_cells_for_bytes( len + 1 );

  // Copy the substring
  // ToDo: fast C++ version
  let ii = 0;
  for( ii = 0 ; ii < len ; ii++ ){
    lean_byte_at_from( new_area, ii, str, start + ii );
  }
  return new_area;
}


// Now we get all we need to implement a simplified std lib compatible string

// Only in C++ however
/*c{

// #define to_cstr( cell ) ( (char*) to_ptr( cell ) )
# define to_cstr( cell ) ( reinterpret_cast<char*>( to_ptr( cell ) ) )


class LeanString {

  public:

  // Where the C string is stored, null terminated
  // It's aligned a cell boundary because it's a byte area from allocate_bytes()
  char* cstr;

  // Constructor for an empty string
  LeanString( void ){
    // An empty string shares the empty string singleton
    lean_lock( the_empty_lean );
    cstr = to_cstr( the_empty_lean );
  }

  // Constructor from a C string
  LeanString( TxtC str ){
    cstr = to_cstr( lean_new_from_native( str ) );
  }

  // Constructor from a C string literal
  template< std::size_t N >
  LeanString( const char (&str)[N] ){
    cstr = to_cstr( lean_new_from_native( str ) );
  }

  // Constructor from a dynamically allocated byte area
  LeanString( Area area ){
    // No copy, just share the same area
    lean_lock(     area );
    cstr = to_ptr( area );
  }

  // Copy constructor
  LeanString( const LeanString& str ){
    // Share the other string, increment the reference counter
    cstr = str.cstr;
    lean_lock( to_cell( cstr ) );
  }

  // Destructor
  ~LeanString( void ){
    // "unshare" the string, decrement the reference counter
    lean_free( to_cell( cstr ) );
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
    // First, forget the old string
    lean_free( to_cell( cstr ) );
    // Then share the new one
    lean_lock( to_cell( str.cstr ) );
    cstr = str.cstr;
    return *this;
  }

  // Assignment operator from a C string
  LeanString& operator=( TxtC str ){
    // Forget the old string
    lean_free( to_cell( cstr ) );
    // Make a new one to remplace the old one
    cstr = to_cstr( lean_new_from_native( str ) );
    return *this;
  }

  // Concatenation operator
  LeanString operator+( const LeanString& str ) const {
    // ToDo: optimize this
    Area str2 = lean_new_from_strcat( to_cell( cstr ), to_cell( str.cstr ) );
    auto r = LeanString( str2 );
    lean_free( str2 );
    return r;
  }

  // Concatenation operator from a C string
  LeanString operator+( TxtC str ) const {
    // ToDo: optimize this
    Area str1 = lean_new_from_native( str );
    Area str2 = lean_new_from_strcat( to_cell( cstr ), str1 );
    auto r = LeanString( str2 );
    lean_free( str1 );
    lean_free( str2 );
    return r;
  }

  // In place concatenation operator
  LeanString& operator+=( const LeanString& str ){
    // Replace the old string by a new one
    auto old_cell = to_cell( cstr );
    cstr = to_cstr( lean_new_from_strcat( old_cell, to_cell( str.cstr ) ) );
    // Unshare the old one
    lean_free( old_cell );
    return *this;
  }

  // In place concatenation operator for a C string
  LeanString& operator+=( TxtC str ){
    auto old_cell = to_cell( cstr );
    auto str1 = lean_new_from_native( str );
    cstr = to_cstr( lean_new_from_strcat( old_cell, str1 ) );
    lean_free( old_cell );
    lean_free( str1 );
    return *this;
  }

  // In place concatenation operator for a char
  LeanString& operator+=( char c ){
    // ToDo: optimize this
    // There is often space for an extra char in the last cell
    auto old_cell = to_cell( cstr );
    char buf[ 2 ] = { c, '\0' };
    auto str1 = lean_new_from_native( buf );
    cstr = to_cstr( lean_new_from_strcat( old_cell, str1 ) );
    lean_free( old_cell );
    lean_free( str1 );
    return *this;
  }

  // Comparison operator
  bool operator==( const LeanString& str ) const {
    return lean_streq( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Comparison operator with a C string
  bool operator==( TxtC str ) const {
    auto r = lean_streq_with_c_str( to_cell( cstr ), str );
    return r;
  }

  // Comparison operator
  bool operator!=( const LeanString& str ) const {
    return !lean_streq( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Comparison operator with a C string
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
    Area str2 = lean_substr( to_cell( cstr ), pos, len );
    auto r = LeanString( str2 );
    lean_free( str2 );
    return r;
  }

  // Return char at position or 0 if out of bounds
  char at( size_t pos ) const {
    // ToDo: should raise an exception when out of bounds?
    if( pos >= (size_t ) length() ) return 0;
    return cstr[ pos ];
  }

  // [] operator. ToDo: that does not compile when used...
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

}; // ToDo: why do I need this semicolon here?


// Now that LeanString is defined, some needed overloaded functions are possible

// Overloaded binary + operator for "xxx" + LeanString
static LeanString operator+( TxtC str1, const LeanString& str2 ){
  MutText r = str1;
  r += str2;
  return r;
}


// static bool mand2( bool b1, const Text& msg ){
//  return mand2_c_str( b1, msg.mut_c_str() );
// }


static int lean_strcmp( const LeanString& str1, TxtC str2 ){
  return strcmp( str1.c_str(), str2 );
}


static bool trace( const LeanString& str ){
  trace_c_str( str.mut_c_str() );
  return true;
}


// Now that LeanString is defined, some needed forward declarations are possible
static Text  dump( Cell );
static Text  short_dump( Cell );
static Text  stacks_dump( void );
static void  set_text_cell( Cell, ConstText );
static Text  cell_to_text( Cell );
static Text  tag_to_text( Tag );
static Text  type_to_text( Index );
static Text  proxy_to_text( Cell );
static Text  integer_to_text( Value );
static Text  verb_to_text_definition( Tag );
static Text  type_to_text( Index );
static Text  inox_machine_code_cell_to_text( Cell );
static Text  extract_line( TxtC, Index );
}*/

/*
 *  There is some special handling of the empty string.
 */

/**/ const no_text = "";
//c/ static const Text no_text( "" );


/* -----------------------------------------------------------------------------
 *  Helper functions to deal with TypeScript and C++ strings in a way that is
 *  compatible with both languages (and with possible future target languages).
 *
 *  tcut(), tbut() and tmid() to extract sub parts of the text.
 *
 *  S(), N(), C(), P() and F() to concatenate text and various types of numbers.
 */

/*
 *  S() start of text concatenation operations.
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
  static Text N( int n ){
    // Copilot generated code
    static char reversed[ 32 ];
    char buf[ 32 ];
    char* ptr = buf;
    if( n == 0 )return "0";
    // Use a loop to convert the number to a string
    if( n < 0 ){
      *ptr++ = '-';
      n = -n;
    }
    while( n > 0 ){
      *ptr++ = '0' + (n % 10);
      n /= 10;
    }
    // Reverse the string
    char* ptr2 = reversed;
    while( ptr > buf ){
      *ptr2++ = *--ptr;
    }
    *ptr2 = '\0';
    return reversed;
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
//c/ static Text _F( const void* fn ){ return N( (int) fn ); }
//c/ #define F( fn ) _F( (const void*) (int) fn )


/*
 *  P( p ) - convert a pointer to a text.
 */

/**/ function P( p : any ){ return N( p ); }
//c/ static Text P( const void* p ){ return N( (int) p ); }


/*
 *  tlen( text )
 *    Return the length of the text.
 *    UTF-8 characters are counted as one character / one byte.
 */

/**/ function tlen( s : Text ){ return s.length; }
//c/ static int tlen( const Text& s ){ return s.length(); }
//c/ static int tlen( TxtC s ){ return strlen( s ); }


/*
 *  tbut( text, n )
 *    Return text minus the first n characters, minus last if n is negative.
 *    I.e. all "but" the first n characters.
 */

/**/ function tbut( s : Text, n : number ){ return s.slice( n ); }

/*c{

static Text tbut( const Text& s, int n ){
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
static Text tcut( const Text& s, int n ){
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

static Text tmid( const Text& t, int start, int end ){
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
static Text tlow( const Text& s ){
  Text r;
  for( unsigned int ii = 0; ii < s.length(); ii++ ){
    // ToDo: very slow
    unsigned char ch = s.at( ii );
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
static Text tup( const Text& s ){
  Text r;
  for( unsigned int ii = 0; ii < s.length(); ii++ ){
    // ToDo: very slow
    unsigned char ch = s.at( ii );
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

/*ts{*/
function teq( s1 : Text, s2 : Text ) : boolean {
  return s1 == s2;
}
/*}*/

// C++ overloaded functions, depending on string representation

/*c{

static bool teq( const Text& s1, const Text& s2 ) {
  return s1 == s2;
}


bool teq( const Text& s1, const char* s2 ) {
  return s1 == s2;
}


static bool teq( const char* s1, const Text& s2 ) {
  return s2 == s1;
}


static bool teq( const Text& s1, char s2 ) {
  if( s1.empty() )return s2 == 0;
  return s1.length() == 1 && s1.c_str()[ 0 ] == s2;
}


static bool teq( const char* s1, const char* s2 ) {
  return strcmp( s1, s2 ) == 0;
}


static bool teq( char s1, char s2 ) {
  return s1 == s2;
}


static bool teq( char s1, const char* s2 ) {
  return s2[ 0 ] == s1 && s2[ 1 ] == 0;
}

}*/


/*
 *  tneq( text1, text2 ) - tneq, text not equal.
 *    Return true if two texts are not the same text.
 *   I.e. the opposite of teq().
 */

/*ts{*/
function tneq( s1 : Text, s2 : Text ) : boolean {
  return s1 != s2;
}
/*}*/

// C++ overloaded functions, depending on string representation
/*c{

static bool tneq( const Text& s1, const Text& s2 ) {
  return s1 != s2;
}


static bool tneq( const Text& s1, const char* s2 ) {
  return strcmp( s1.c_str(), s2 ) != 0;
}


static bool tneq( const char* s1, const Text& s2 ) {
  return s2 != s1;
}


static bool tneq( const char* s1, const char* s2 ) {
  return strcmp( s1, s2 ) != 0;
}


static bool tneq( const char* s1, char s2 ) {
  return s1[ 0 ] != s2 || s1[ 1 ] != 0;
}


static bool tneq( char s1, char s2 ) {
  return s1 != s2;
}


static bool tneq( char s1, const char* s2 ) {
  return s2[ 0 ] != s1 || s2[ 1 ] != 0;
}

}*/


/*
 *  tidx() index of substring in text, -1 if not found
 */

function tidx( s : ConstText, sub : ConstText ) : Index {
  /**/ return s.indexOf( sub );
  //c/ return s.find( sub );
}


/*
 *  tidxr() last index of substring in text, -1 if not found
 */

function tidxr( s : ConstText, sub : ConstText ) : Index {
  /**/ return s.lastIndexOf( sub );
  //c/ return s.rfind( sub );
}


/* -----------------------------------------------------------------------------
 *  Some more assertion checker, defined now because they use the LeanString
 *  type that is not yet defined when the other assertion checkers are defined.
 */

function mand_eq( a : i32, b : i32 ) : boolean {
// Check that two values are equal

  if( a == b )return true;

  if( bootstrapping )return mand( false );

  // The code below may fail, let's avoid infinite recursion
  if( mand_entered != 0 ){
    /**/ trace(
    //c/ trace_const_c_str(
      "mand() called recursively"
    );
    debugger;
    return true;
  }
  mand_entered = 1;

  if( tag_is_valid( a ) || tag_is_valid( b ) ){
    if( tag_is_valid( a ) && tag_is_valid( b ) ){
      trace(
        S()+ "bad eq " + tag_to_text( a ) + " / " + tag_to_text( b )
      );
    }else if( tag_is_valid( a ) ){
      trace( S()+ "bad eq " + tag_to_text( a ) + " / " + N( b ) );
    }else{
      trace( S()+ "bad eq " + N( a ) + " / " + tag_to_text( b ) );
    }
  }
  mand2( false, S()+ "bad eq " + N( a ) + " / " + N( b ) );

  mand_entered = 0;
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

//c/ #ifdef __CHEERP__

/*c{

static Index init_cell_allocator(){
  the_very_first_cell = to_cell( (int) ( (u64*) calloc( INOX_HEAP_SIZE, 1 ) ) );
  the_cell_limit = the_very_first_cell + to_cell( INOX_HEAP_SIZE );
  return 1;
}

}*/

//c/ #else

//c/ static Cell the_previous_chunk_area = 0;

function init_cell_allocator() : Index {

  // TypeScript version, using ArrayBuffers:
  /*ts{*/
    the_very_first_cell = 0;
    the_cell_limit = to_cell( mem32.byteLength );
  /*}*/

  // C++ version, using calloc() linked chuncks of byte areas:
  /*c{

    // There is a lower limit to the initial heap size
    de&&mand( INOX_HEAP_SIZE >= 3 * size_of_cell );

    // Use system's calloc() to allocate the first chunk of memory
    the_very_first_cell = to_cell( (int) calloc( INOX_HEAP_SIZE, 1 ) );

    // Check that the allocation succeeded
    if( the_very_first_cell == 0 ){
      FATAL( "Out of memory, first calloc() failed" );
      return 0;
    }

    // Set the new limit
    the_cell_limit = the_very_first_cell + to_cell( INOX_HEAP_SIZE );

    // Set two sentinel cells, fake header, just to help debug the interpreter
    set(
      the_cell_limit - 2 * ONE,
      type_integer,
      tag_dynamic_ref_count,
      0
    );
    set(
      the_cell_limit - 1 * ONE,
      type_integer,
      tag_dynamic_area_size,
      2 * size_of_cell // empty payload
    );
    the_previous_chunk_area = the_cell_limit;
    alloc_de&&mand_cell_name(
      the_previous_chunk_area - 2 * ONE,
      tag_dynamic_ref_count
    );
    alloc_de&&mand_cell_name(
      the_previous_chunk_area - 1 * ONE,
      tag_dynamic_area_size
    );

    // Reduce the limit accordingly
    the_cell_limit -= 2 * ONE;

  }*/

  the_next_free_cell = the_very_first_cell;

  // Avoid using the addresses that match a type id
  // It helps for debugging traces, see N() and C()
  /**/ allocate_cells( 16 );

  // The first allocated cell is a tempory cell that is sometimes convenient
  the_tmp_cell = allocate_cell();

  return 1;
}

//c/ #endif


/* -----------------------------------------------------------------------------
 *  The memory
 *
 *  The memory is the place where data manipulated by the Inox interpreter is
 *  stored. It looks like a contiguous area of memory, divided into cells. Each *  cell is 64 bits wide, 3 parts : 4 bits for the type of the cell, 28 bits for
 *  for the name of the cell and 32 bits for the value of the cell. Such values
 *  are called "named values". Each cell has an address. It is the index of the
 *  cell in the memory. The possible range extends from 0 to 2^28-1, ie
 *  approximately 268 million cells. It should be possible to change the size of
 *  a cell, either to reduce it or to increase it. The size of a cell is defined
 *  by the size_of_cell constant, itself defined as the addition of 32 bits for
 *  the value, 28 bits for the name and 4 bits for the type, the type and name
 *  beeing packed together in a single 32 bits value.
 *
 *  The implementation of the memory is not the same in TypeScript and C++. In
 *  TypeScript, the memory is implemented as an ArrayBuffer, a contiguous area
 *  of memory. In C++, the memory is implemented as a linked list of chunks of
 *  memory, each chunk being allocated by the system's calloc() function.
 *
 *  With this solution, some cells are not used, ie they are not part of the
 *  addressable memory. In TypeScript, the available cells are the ones between
 *  address 0 and some upper limit that can grow. In C++, the available cells
 *  are between some lower limit and some upper limit that can grow. The lower
 *  limit is the address of the first cell of the older chunk of memory. The
 *  upper limit is the address of the last cell of the last chunk of memory.
 *  In between, there are gaps that depends on the results of the calloc()
 *  function.
 *
 *  If this chunk based solution is not good enough, it should be possible to
 *  add an indirection layer, ie to use a table of pointers to fixed size
 *  chunks, in order to restore an apparently contiguous memory.
 *
 *  The memory is further divided into two parts : the free region and the
 *  allocated region. The free region is the part of the memory that is not
 *  yet used, it is located between some lower limit and some upper limit.
 *  The lower limite is stored in the global variable the_next_free_cell.
 *  The upper limit is stored in the global variable the_cell_limit.
 *
 *  At the other end, at the bottom of the memory, there is also a limit,
 *  stored in variable the_very_first_cell. It is the address of the first cell
 *  of the older chunk of memory in C++ and 0 in TypeScript.
 *
 *  The allocated part of the memory is further divided in smaller parts, each
 *  part being called "an area in the heap". Such areas are allocated much
 *  like bytes are in C using malloc() and free(). The difference is that
 *  areas are allocated in cells, not in bytes. There is also a reference
 *  counter associated with each area. When the reference counter reaches 0,
 *  the area is freed. The reference counter is stored in the first cell of
 *  the area. The first cell is called the "header" of the area. The header
 *  contains the type of the area, the size of the area and the reference
 *  counter. The size of the area is stored in the second cell of the area.
 *  Then comes the payload of the area, ie the actual data. The payload is
 *  often an array of cells but it can also be an array of bytes, for text
 *  strings typically.
 *
 *  Note: in AssemblyScript (hence WASM), the memory is not contiguous, it is
 *  organized much like a linked list of chunks of memory, like in C++. This
 *  is not yet implemented however.
 *
 *  ToDo: because the results of calloc() do not increase monotonically, it
 *  should be possible to reorganize the memory in order to change the layout
 *  with a lower bound that can change over time and an additional limit for
 *  the upper bound of the free region. This would allow to use the memory
 *  more efficiently. The current workaround is to keep trying to allocate
 *  more memory at a higher address by asking for more memory from the system.
 */

//c/ #ifdef __CHEERP__
  // ToDo:
  //c/ void grow_memory( size_t ){}
//c/ #else

function grow_memory( sz : Size ){
// The heap is full, need to expand it by some amount

  // Align on size of a cell, ie 7 becomes 8, 9 becomes 16, etc.
  let min_size = area_aligned_size( sz );

  // Make sure some minimum size is allocated
  if( min_size < INOX_HEAP_SIZE ){
    min_size = INOX_HEAP_SIZE;
  }

  // In any case, the minimum size should be the size of one cell
  if( min_size < size_of_cell ){
    min_size = size_of_cell;
  }

  // TypeScript version:
  /*ts{*/

    // Allocate a new memory buffer that is bigger than the old one
    const new_total_size = min_size + mem32.byteLength;
    alloc_de&&mand( new_total_size % size_of_cell == 0 );
    const new_mem    = new ArrayBuffer( new_total_size );
    const new_mem8   = new Uint8Array(     new_mem );
    const new_mem32  = new Int32Array(     new_mem );
    const new_mem32f = new Float32Array(   new_mem );
    const new_mem64  = new BigUint64Array( new_mem );

    // Copy the old memory buffer into the new one
    // ToDo: use ArrayBuffer.transfert() when it becomes available (03/2023)
    new_mem32.set( mem32 );

    // Update the global variables
    mem    = new_mem;
    mem8   = new_mem8;
    mem32  = new_mem32;
    mem32f = new_mem32f;
    mem64  = new_mem64;

    // See the new limit, valid adresses are below it
    the_cell_limit = to_cell( mem32.byteLength );
    de&&mand_cell_in_range( the_cell_limit - 1 * ONE );

  /*}*/

  // C++ version:
  /*c{

    // Add space for a gap area header at the end of the new memory chunk
    min_size += 2 * size_of_cell;

    // Allocate the new chunk, to be linked to the old one, well aligned
    int new_mem = (int) calloc( min_size / size_of_cell, size_of_cell );

    if( new_mem == 0 ){
      FATAL( "Out of memory for cells" );
      return;
    }

    // New chuck must be at a higher address than the old limit
    // ToDo: handle the case where it is not
    if( (int) new_mem < (int) to_ptr( the_cell_limit ) ){
      // It bugs if new_mem is at a lower address than the old limit
      // Workaround: ask for a bigger chunk until it's address is higher
      // Doing so would eventually lead to some sbrk() call by malloc and
      // the address should be higher.
      // There is nothing to lose to try, let's ask for more, twice more
      free( (void*) new_mem );
      grow_memory( min_size * 2 );
      return;
    }

    // The new next free cell is the one at the beginning of the new chunk
    the_next_free_cell = to_cell( (int) new_mem );

    // Update the gap busy area at the end of the older chunk to skip the gap
    // Note: by convention, the id of an area is the address of the payload,
    // not the address of the header that is two cells before. See to_header().
    int old_gap_area = the_cell_limit + 2 * ONE;
    alloc_de&&mand_eq( old_gap_area, the_previous_chunk_area );

    // Gap between the end of the old chunk and the beginning of the new chunk
    int gap_size = (int) new_mem - ( (int) to_ptr( the_cell_limit ) );

    // Push the limit to avoid memory assert failures on bound checks
    the_cell_limit += 2 * ONE;

    // Check that the previously set sentinel cells are still there
    alloc_de&&mand_eq( old_gap_area, the_cell_limit );
    alloc_de&&mand_cell_name(
      old_gap_area - 2 * ONE,
      tag_dynamic_ref_count
    );
    alloc_de&&mand_cell_name(
      old_gap_area - 1 * ONE,
      tag_dynamic_area_size
    );

    // Reinitialize the previous chunck's busy gap area headers
    area_init_busy( old_gap_area, gap_size );

    // The end of the old gap area should be the start of the new area
    alloc_de&&mand_eq(
      ( old_gap_area - 2 * ONE ) + to_cell( gap_size ),
      to_cell( new_mem )
    );
    alloc_de&&mand_eq(
      (int) to_ptr( old_gap_area ) - 2 * size_of_cell
      + area_size( old_gap_area ),
      (int) new_mem
    );

    // Set the new limit
    the_cell_limit = to_cell( (int) new_mem + min_size );

    const new_gap_area = the_cell_limit;

    // Set two sentinel cells, gap header, just to help debug the interpreter
    set(
      new_gap_area - 2 * ONE,
      type_integer,
      tag_dynamic_ref_count,
      0
    );
    set(
      new_gap_area - 1 * ONE,
      type_integer,
      tag_dynamic_area_size,
      2 * size_of_cell // empty payload
    );
    the_previous_chunk_area = new_gap_area;

    // Decrease the limit accordingly
    the_cell_limit -= 2 * ONE;

    // The number of free cells should match the new size, minus the gap skipper
    alloc_de&&mand_eq(
      (int) to_ptr( the_cell_limit ) - (int) to_ptr( the_next_free_cell ),
      min_size - 2 * size_of_cell
    );

  }*/
}

//c/ #endif


function mand_list_cell( c : Cell ) : boolean {
// Check that a cell is a list cell
  mand_eq( name_of( c ), tag_list );
  return true;
}


function next( c : Cell ) : Cell {
// Assuming cell is a list member, return next cell in list
  // When a cell is unused, the name is changed into "list" and the value
  // is used to store the next cell in some list.
  // ToDo: use a native type instead of this trickery?
  de&&mand_list_cell( c );
  return value_of( c );
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
  if( the_next_free_cell + n * ONE > the_cell_limit ){
    // The heap is full, we need to expand it
    grow_memory( n * size_of_cell );
  }
  alloc_de&&mand( the_next_free_cell           <  the_cell_limit );
  alloc_de&&mand( the_next_free_cell + n * ONE <= the_cell_limit );
  const cell = the_next_free_cell;
  the_next_free_cell += n * ONE;
  alloc_de&&mand_cell_in_range( cell );
  alloc_de&&mand_cell_in_range( the_next_free_cell - 1 * ONE );
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
    if( the_next_free_cell == the_cell_limit ){
      // The heap is full, we need to expand it
      grow_memory( 0 );
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


function compact_cells_free() : void {
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


function cell_free( c : Cell ) : void {
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


function cells_free( c : Cell, n : Count ) : void {
// Free a number of consecutive cells

  // If last allocated cells, restore the next free cell
  if( c + n * ONE == the_next_free_cell ){
    // This works well for fast LIFO style allocations
    the_next_free_cell = c;
    compact_cells_free();
    return;
  }

  // ToDo: If big enough, it is better to add it to the dynamic pool.
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    cell_free( c + ii * ONE );
  }

}


/* ---------------------------------------------------------------------------
 *  Dynamic areas of cells.
 *  Dynamic memory allocation of cells in the heap.
 *  Bytes areas are allocated and freed using a reference counter.
 *  Each busy area has two header cells that contain the reference counter and
 *  a size. When the area is free, the first header links to the next free area.
 *  ToDo: should reuse the platform provided malloc/free to the extend
 *  it is possible?
 *  All ptr are to regular cells, all sizes are number of bytes. The header
 *  is two cells long and is stored before the area.
 *  ToDo: size optimisation where name of ref counter also encodes the size.
 *  This would be usefull for small areas, boxed values and proxied objects.
 *  dynrc1 would mean one cell, ie 8 bytes + 8 bytes header. This
 *  is a total of 16 bytes versus the non optimized 24 bytes.
 *  ToDo: there could also be special types for free and busy areas.
 *  With this scheme, the name part of a cell would not be a name anymore
 *  and could be either a reference counter, a size or a pointer to the next
 *  free area. As a result, the overhead of an area would be 8 bytes versus
 *  the current 16 bytes. In some cases, storing the size in the header
 *  is not necessary, for example when the area is a boxed value or a proxied
 *  object or some kind of array whose size in store elsewhere. However,
 *  the reference counter is still neeed. That would not be the case
 *  if there were a garbage collector. This is fairly complex.
 */


function init_area_allocator() : Index {

  the_first_free_area = 0;

  // Check precomputed tags
  de&&mand_eq( tag( "_dynrc" ), tag_dynamic_ref_count );
  de&&mand_eq( tag( "_dynxt" ), tag_dynamic_next_area );
  de&&mand_eq( tag( "_dynsz" ), tag_dynamic_area_size );

  // This completes the low level bootstrap phase 1
  bootstrapping = false;

  return 1;

}


function area_to_header( area : Area ) : Cell {
// Return the address of the first header cell of a byte area, the ref count.
  return area - 2 * ONE;
}

function header_to_area( header : Cell ) : Area {
// Return the address of an area given the address of it's first header cell.
  // Skip the two header cells, the reference counter and the size
  return header + 2 * ONE;
}


function area_ref_count( area : Area ) : Value {
// Return the value of the reference counter of a byte area
  alloc_de&&mand( area_is_busy( area ) );
  return value_of( area_to_header( area ) );
}


function area_turn_busy( area : Area, sz : Size ){
// Set the reference counter header of a free byte area to 1, ie it becomes busy
  const header = area_to_header( area );
  // Before it becomes busy, it was free, so it must have a next_area header
  alloc_de&&mand_cell_name( header, tag_dynamic_next_area );
  set( header, type_integer, tag_dynamic_ref_count, 1 );
  alloc_de&&mand_cell_name( header + ONE, tag_dynamic_area_size );
  set_value( header + ONE, sz );
}


function area_turn_free( area : Area, next_area : Area ){
// Set the tag of the header of a byte area to tag_dynamic_next_area
  const header = area_to_header( area );
  set( header, type_integer, tag_dynamic_next_area, next_area );
}


function area_init_busy( area : Area, size : Count ){
// Initialize a new busy area
  const header = area_to_header( area );
  set( header, type_integer, tag_dynamic_ref_count, 1 );
  set( header + ONE, type_integer, tag_dynamic_area_size, size );
}


function area_is_busy( area : Area ) : boolean {
// Return true if the area is busy, false if it is free
  alloc_de&&mand( area_is_safe( area ) );
  return name_of( area_to_header( area ) ) == tag_dynamic_ref_count;
}


function area_is_free( area : Area ) : boolean {
// Return true if the area is free, false if it is busy
  alloc_de&&mand( area_is_safe( area ) );
  return name_of( area_to_header( area ) ) == tag_dynamic_next_area;
}


function area_cell_is_area( cell : Cell ) : boolean {
// Return true if the cell is the first cell of a dynamic area, false otherwise
  // This is maybe not 100% reliable, but it is good enough
  const first_header = area_to_header( cell );
  if( name_of( first_header ) == tag_dynamic_ref_count ){
    if( type_of( first_header ) == type_integer ){
      alloc_de&&mand( area_is_busy( cell ) );
      return true;
    }
    return false;
  }else if( name_of( first_header ) == tag_dynamic_next_area ){
    if( type_of( first_header ) == type_integer ){
      alloc_de&&mand( area_is_free( cell ) );
      return true;
    }
    return false;
  }else{
    return false;
  }
}


function area_next( area : Area ) : Area {
// Return the address of the next free area
  alloc_de&&mand( area_is_free( area ) );
  return value_of( area_to_header( area ) );
}


function area_set_next( area : Area, nxt : Area ){
// Set the address of the next free area
  alloc_de&&mand( area_is_free( area ) );
  set_value( area_to_header( area ), nxt );
}


function area_set_ref_count( area : Area, v : Value ){
// Set the reference counter of a byte area
  alloc_de&&mand( area_is_busy( area ) );
  set_value( area_to_header( area ), v );
}


function area_size( area : Area ) : Size {
// Return the size of a byte area, in bytes. It includes the 2 header cells
  alloc_de&&mand( area_is_safe( area ) );
  const byte_size = value_of( area_to_header( area ) + offset_of_area_size * ONE );
  // Do as if last cell was fully occupied
  const aligned_size = ( byte_size + size_of_cell - 1 ) & ~( size_of_cell - 1 );
  return aligned_size;
}


function area_length( area : Area ) : Length {
// Return the length, in cells. It does not include the 2 header cells
  return to_cell( area_size( area ) ) - 2;
}


function area_payload_size( area : Area ) : Size {
// Return the size of a byte area, in bytes. It does not include the headers
// and it is not aligned on cell size. ie, that the "true" size of the payload.
  // For lean strings, the minimum size is 1 byte, due to the null terminator
  // The size is in the header that is just before the area
  return value_of( area - 1 * ONE ) - 2 * size_of_cell;
}


function area_set_size( area : Area, s : Size ) : void {
// Set the size of a byte area, it includes the header
  const header = area_to_header( area );
  // The second header is after the first one, ie after the ref count.
  set( header + offset_of_area_size, type_integer, tag_dynamic_area_size, s );
}


function area_aligned_size( s : Size ) : Size {
// Align on size of cells, ie 7 becomes 8, 8 stays 8, 9 becomes 16, etc
  let aligned_size = ( s + ( size_of_cell - 1 ) ) & ~( size_of_cell - 1 );
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
let   how_much_was_collected = 0;

function area_free_small_areas() : Count {
// Free all small areas, ie all areas of size 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  how_much_was_collected = 0;
  let ii;
  for( ii = 0 ; ii < 10 ; ii++ ){
    let free;
    while( ( free = all_free_lists_by_area_length[ ii ] ) != 0 ){
      all_free_lists_by_area_length[ ii ] = area_next( free );
      area_set_next( free, the_first_free_area );
      the_first_free_area = free;
      de&&mand( area_is_free( free ) );
      how_much_was_collected++;
    }
  }
  return how_much_was_collected;
}


let count_total_busy = 0;
let count_total_free = 0;


function area_garbage_collector() : Count {
  // Garbage collect the dynamic areas. Return false if nothing was collected.

  // Set the default return value
  how_much_was_collected = 0;
  count_total_busy = 0;
  count_total_free = 0;

  // First empty all the "per length" free lists, they interfere.
  how_much_was_collected = area_free_small_areas();

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
    if( count_visited > collector_increment
      && how_much_was_collected != 0
    ){
      break;
    }

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
    if( !area_cell_is_area( cell + 2 * ONE ) ){
      continue;
    }

    // If busy, skip it
    if( !area_is_free( cell + 2 * ONE ) ){
      count_total_busy++;
      cell += to_cell( area_size( cell + 2 * ONE ) );
      continue;
    }

    // The area is after two header cells, ptr to next area and size
    cell += 2 * ONE;

    alloc_de&&mand( area_is_free( cell ) );
    count_total_free++;

    // Coalesce consecutive free areas, as long as there are some
    while( true ){

      // ToDo: if size were not aligned, it should be aligned here
      const potential_next_area = cell + to_cell( area_size( cell ) );

      if( potential_next_area >= the_next_free_cell
      || !area_cell_is_area( potential_next_area )
      || !area_is_free(      potential_next_area )
      ){
        break;
      }

      // Coalesce consecutive two free areas
      let total_size = area_size( cell ) + area_size( potential_next_area );
      area_set_size( cell, total_size );
      area_set_next( cell, area_next( potential_next_area ) );
      reset( area_to_header( potential_next_area ) );
      reset( area_to_header( potential_next_area ) + ONE );

      // If that was the head of the free list, update it
      if( the_first_free_area == potential_next_area ){
        the_first_free_area = cell;
      }
      how_much_was_collected++;

      // Check that it did work
      if( alloc_de ){
        mand( area_is_free( cell ) );
        mand( !area_cell_is_area( potential_next_area ) );
      }

    } // End of while( true ) over consecutive free areas

  } // End of while( true ) over all cells

  last_visited_cell = cell;
  return how_much_was_collected;

}


function area_garbage_collector_all(){
// Run garbage collector until nothing is collected
  // First compact the free cells used by allocate_cell()
  compact_cells_free();
  // Start from the beginning and loop until nothing is collected
  last_visited_cell = 0;
  // Loop until nothing is collected
  while( area_garbage_collector() != 0 ){
    // ToDo: don't monopolize the processor
  };
}

/*
 *  Allocate a byte area, return its address, or 0 if not enough memory
 */

let allocate_area_entered = 0;

// Some monitoring to detect memory leaks
let stat_allocated_bytes   = 0;
let stat_allocated_areas   = 0;
let stat_deallocated_bytes = 0;
let stat_deallocated_areas = 0;


function allocate_area( sz : Size ) : Area {

  if( alloc_de ){
    if( allocate_area_entered != 0 ){
      debugger;
      FATAL( "allocate_area() reentered" );
      return 0;
    }
  }

  // To detect some catastrophic errors
  allocate_area_entered = 1;

  /**/ if( de ){
  /**/   if( sz > 20000 ){
  /**/     if( sz != INOX_HEAP_SIZE / 2 ){
  /**/       bug( S()+ "Large memory allocation, " + N( sz ) );
  /**/       debugger;
  /**/     }
  /**/   }
  /**/   // alloc_de&&mand( size != 0 );
  /**/ }

  // Was something broken?
  alloc_de&&mand(
    the_first_free_area == 0 || area_is_free( the_first_free_area )
  );

  // Align on 64 bits, size of a cell, plus size of headers
  let adjusted_size = area_aligned_size( sz ) + 2 * size_of_cell;

  // Search in "per length" free lists if size is small enough
  if( adjusted_size < 10 * size_of_cell ){
    let try_length = to_cell( adjusted_size );
    let small_free_area = all_free_lists_by_area_length[ try_length ];
    if( small_free_area ){
      all_free_lists_by_area_length[ try_length ]
      = area_next( small_free_area );
      area_turn_busy( small_free_area, sz + 2 * size_of_cell );
      allocate_area_entered = 0;
      stat_allocated_bytes += adjusted_size;
      stat_allocated_areas += 1;
      return small_free_area;
    }
  }

  // Search first fit, starting from the first item of the free area list
  alloc_de&&mand(
    the_first_free_area == 0 || area_is_free( the_first_free_area )
  );
  let area = the_first_free_area;
  let area_sz = 0;
  let previous_area = 0;
  let limit = 100000;
  while( area ){

    // Never loop forever
    if( limit-- == 0 ){
      allocate_area_entered = 0;
      // ToDo: this does happen, but it's not clear why
      FATAL( "Infinite loop in allocate_area" );
      return 0;
    }

    alloc_de&&mand( area_is_free( area ) );
    area_sz = area_size( area );

    if( area_sz < adjusted_size ){
      // The area is too small, try next one
      previous_area = area;
      area = area_next( area );
      // Detect loop in list
      if( area == the_first_free_area ){
        debugger;
        return 0;
      }
      continue;
    }

    // The area is big enough, use it
    if( previous_area ){
      // The area is not the first one, remove it from the list
      alloc_de&&mand_eq( area_next( previous_area ), area );
      area_set_next( previous_area, area_next( area ) );
    }else{
      // The area is the first one, update the list
      alloc_de&&mand_eq( area, the_first_free_area );
      the_first_free_area = area_next( area );
      alloc_de&&mand(
        the_first_free_area == 0 || area_is_free( the_first_free_area )
      );
    }

    // Break big area and release extra space
    let remaining_size = area_sz - adjusted_size;

    // Only split if the remaining area is big enough for the smallest payload
    if( remaining_size > 2 * size_of_cell ){
      let remaining_area = area + to_cell( adjusted_size );
      area_set_size( remaining_area, remaining_size );
      // The remaining area becomes the new first free area
      area_turn_free( remaining_area, the_first_free_area );
      if( the_first_free_area ){
        alloc_de&&mand( area_is_free( the_first_free_area ) );
        area_set_next( remaining_area, the_first_free_area );
      }
      the_first_free_area = remaining_area;
      alloc_de&&mand( area_is_free( remaining_area ) );

    }else{
      // The area is too small to split, use it all
      adjusted_size = area_sz;
    }

    // Mark the found free area as busy, for the requested size + the headers
    area_turn_busy( area, sz + 2 * size_of_cell );

    alloc_de&&mand( area_is_busy(    area ) );
    alloc_de&&mand( !area_is_shared( area ) );
    alloc_de&&mand_neq( area, the_first_free_area );
    alloc_de&&mand(
      the_first_free_area == 0 || area_is_free( the_first_free_area )
    );

    allocate_area_entered = 0;
    stat_allocated_bytes += adjusted_size;
    stat_allocated_areas += 1;
    return area;

  }

  // If nothing was found, allocate more memory for the heap and retry
  alloc_de&&mand(
    the_first_free_area == 0 || area_is_free( the_first_free_area )
  );

  // Add some extra cells to avoid too many small allocations
  let extra_cells = 128;

  // Don't forget the cell for the refcount and size headers
  let needed_cells = to_cell( adjusted_size ) + extra_cells + 2;

  const cells = allocate_cells( needed_cells );
  alloc_de&&mand( cells + needed_cells * ONE <= the_next_free_cell );

  alloc_de&&mand(
    the_first_free_area == 0 || area_is_free( the_first_free_area )
  );

  // Skip the refcount and size headers future headers
  area = cells + 2 * ONE;

  // Pretend it is a busy area and then free it to add it to the heap
  area_init_busy( area, needed_cells * size_of_cell );
  alloc_de&&mand( area_is_busy( area ) );
  area_free( area );

  // Retry the allocation, it should work now
  allocate_area_entered = 0;
  const allocated_area = allocate_area( sz );

  // The result should be the newly added area
  alloc_de&&mand_eq( allocated_area, area );
  alloc_de&&mand_eq(
    area + to_cell( adjusted_size ),
    the_first_free_area
  );

  // The new first free area should contain the extra cells
  alloc_de&&mand_eq(
    area_payload_size( the_first_free_area ),
    extra_cells * size_of_cell
  );

  // Defensive
  alloc_de&&mand(
    the_first_free_area == 0 || area_is_free( the_first_free_area )
  );

  stat_allocated_bytes += adjusted_size;
  stat_allocated_areas += 1;
  return allocated_area;

}


function resize_area( area : Area, sz : Size ) : Area {
  alloc_de&&mand( area_is_busy( area ) );
  let ii = area_size( area );
  if( sz <= ii ){
    // ToDo: should split the area and free the extra space
    return area;
  }
  const new_mem = allocate_area( sz );
  while( true ){
    ii -= size_of_cell;
    // ToDo: should copy cell if previous area is referenced somewhere?
    alloc_de&&mand( area_ref_count( area ) <= 1 );
    move_cell( area + ii * size_of_cell, new_mem + ii * size_of_cell );
    if( ii == 0 )break;
  }
  area_free( area );
  return new_mem;
}


function area_free( area : Area ){

  // Void is void is void
  if( area == 0 ){
    return;
  }

  if( area == the_empty_lean ){
    return;
  }

  alloc_de&&mand( area_is_busy( area ) );
  const old_count = area_ref_count( area );

  // Just decrement the reference counter if it's not the last reference
  if( old_count != 1 ){
    area_set_ref_count( area, old_count - 1 );
    return;
  }

  // The whole area should be full of zeros, ie cleared
  if( de ){
    const capacity = area_length( area );
    let ii;
    for( ii = 0 ; ii < capacity ; ii++ ){
      mand_empty_cell( area + ii * ONE );
    }
  }

  // Add to a "per length" free list if small enough area
  const size = area_size( area );
  if( size < 10 * size_of_cell ){
    area_turn_free( area, all_free_lists_by_area_length[ to_cell( size ) ] );
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
  area_turn_free( area, the_first_free_area );
  alloc_de&&mand(
    the_first_free_area == 0 || area_is_free( the_first_free_area )
  );
  the_first_free_area = area;
  alloc_de&&mand( area_is_free( area ) );
}


function area_lock( area : Area ){
// Increment reference counter of bytes area allocated using allocate_bytes()
  // When area_free() is called, that counter is decremented and the area
  // is actually freed only when it reaches zero.

  // Void is void is void
  if( area == 0 ){
    return;
  }

  alloc_de&&mand( area_is_busy( area ) );

  // Increment reference counter
  const old_count = area_ref_count( area );
  const new_count = old_count + 1;
  area_set_ref_count( area, new_count );

}


function area_is_shared( area : Area ) : boolean {
  // When the last reference disappears the bytes must be freed
  // To be called by clear_cell() only, on non zero adresses

  // Void is void is void
  if( area == 0 )return true;

  alloc_de&&mand( area_is_busy( area ) );

  return area_ref_count( area ) != 1;

}

// To dectect loops in list of free areas, defensive
let area_is_safe_entered = 0;
let area_is_safe_entered_nth = 0;

function area_is_safe( area : Cell ) : boolean {
// Try to determine if the address points to a valid area

  if( !alloc_de )return true;

  // This helps to debug unbalanced calls to area_lock() and area_free().
  // zero is ok for both reference counter & size because it never happens
  if( area == 0 ){
    return true;
  }

  const header = area_to_header( area );

  // The address must be in the heap
  if( header < the_very_first_cell && !bootstrapping ){
    FATAL( S()+ "Invalid area, too low, " + C( area ) );
    return false;
  }
  if( header >= the_next_free_cell ){
    FATAL( S()+ "Invalid area, too high, " + C( area ) );
    return false;
  }

  // The address must be aligned on a cell boundary
  if( area % ( size_of_cell / size_of_word ) != 0 ){
    FATAL( S()+ "Invalid area, not aligned on a cell boundary, " + C( area ) );
    return false;
  }

  // When busy
  if( name_of( header ) == tag_dynamic_ref_count ){

    // The reference counter must be an integer
    alloc_de&&mand( type_of( header ) == type_integer );

    // The reference counter must be non zero when busy
    const reference_counter = value_of( header );
    if( reference_counter == 0 ){
      FATAL( S()
        + "Invalid area, 0 reference counter, " + N( reference_counter )
        + " " + N( area )
      );
      return false;
    }

    // When one of the 4 most significant bits is set, that's a type id probably
    if( reference_counter >= ( 1 << 28 ) ){
      // It also could be a very big reference counter, but that's unlikely
      const type = unpack_type( reference_counter );
      FATAL( S()+ "Invalid area, bad counter, " + N( type ) + " " + C( area ) );
      return false;
    }

  }else if( name_of( header ) == tag_dynamic_next_area ){

    // The value should be the integer address of a next free area, or zero
    alloc_de&&mand( type_of( header ) == type_integer );
    if( area_is_safe_entered == area ){
      debugger;
      area_is_safe_entered = 0;
      area_is_safe_entered_nth = 0;
      FATAL( S()+ "Invalid free area, loop, " + C( area ) );
      return false;
    }


    // Limit the amount of recursion when walking the list of free areas
    // ToDo: the limit should be configurable at compile time. On some CPUs it
    // bombs at 377
    if( area_is_safe_entered_nth > 10 ){
      // Just walk the list instead
      let nxt = area;
      while( true ){
        nxt = area_to_header( value_of( nxt ) );
        if( nxt == -2 )break;
        if( nxt == area_is_safe_entered ){
          area_is_safe_entered = 0;
          area_is_safe_entered_nth = 0;
          FATAL( S()+ "Invalid free area, loop, " + C( area ) );
          return false;
        }
      }
      return true;
    }

    const next = value_of( header );

    if( next != 0 ){
      if( area_is_safe_entered == 0 ){
        area_is_safe_entered = area;
      }
      area_is_safe_entered_nth++;
      if( !area_is_safe( next ) ){
        area_is_safe_entered = 0;
        area_is_safe_entered_nth = 0;
        FATAL( S()+ "Invalid area, bad next, " + C( next ) + " " + C( area ) );
        return false;
      }
      area_is_safe_entered_nth--;
      if( area_is_safe_entered == area || area_is_safe_entered_nth <= 0 ){
        area_is_safe_entered = 0;
        area_is_safe_entered_nth = 0;
      }
    }

  }else{
    FATAL( S()+ "Invalid area, bad header, " + N( header ) + " " + C( area ) );
    return false;
  }

  // The second header must be named tag_dynamic_area_size
  if( name_of( header + 1 * ONE ) != tag_dynamic_area_size ){
    FATAL( S()+ "Invalid area, bad size header, " + C( area ) );
    return false;
  }

  // It must be an integer
  if( type_of( header + 1 * ONE ) != type_integer ){
    FATAL( S()+ "Invalid area, bad size header type, " + C( area ) );
    return false;
  }

  // The size must be bigger than the size of the headers
  const size = value_of( header + 1 * ONE );
  if( size
    /**/ < // empty payload areas are oids for proxied objects
    //c/ <=
    2 * size_of_cell
  ){
    FATAL( S()+ "Invalid area, too small, " + N( size ) + " " + C( area ) );
    return false;
  }

  // The whole area must be in the heap
  if( header + to_cell( size ) > the_next_free_cell && !bootstrapping ){
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
  if( !bootstrapping
  && size > ( the_next_free_cell - the_very_first_cell ) * size_of_cell
  ){
    FATAL( S()+ "Invalid size for area " + N( size ) + " " + C( area ) );
    return false;
  }

  return true;
}


function decrement_object_ref_count( area : Area ){
  area_free( area );
}


function area_test_suite(){
  // This was generated by copilot, it is very insufficent
  const the_area = allocate_area( 10 );
  de&&mand( area_is_busy( the_area ) );
  area_free( the_area );
  de&&mand( area_is_free( the_area ) );
  const the_area2 = allocate_area( 10 );
  de&&mand( area_is_busy( the_area2 ) );
  area_lock( the_area2 );
  de&&mand( area_is_busy( the_area2 ) );
  area_free( the_area2 );
  de&&mand( area_is_busy( the_area2 ) );
  area_free( the_area2 );
  de&&mand( area_is_free( the_area ) );
}


/* ------------------------------------------------------------------------
 *
 */


function mand_empty_cell( c : Cell ) : boolean {
// Check that a cell is empty, 0, 0, 0
  mand_eq( name_of(  c ), 0 );
  mand_eq( value_of( c ), 0 );
  mand_eq( type_of(  c ), 0 );
  return true;
}


/*ts{*/

function set( c : Cell, t : Type, n : Tag, v : Value ) : void {
  de&&mand( tag_is_valid( n ) );
  init_cell( c, v, pack( t, n ) );
  if( mem_de ){
    de&&mand_eq( type_of(  c ), t );
    de&&mand_eq( name_of(  c ), n );
    de&&mand_eq( value_of( c ), v );
  }
}

function set_tos( t : Type, n : Name, v : Value ) : void {
  set( TOS, t, n, v );
}
/*}*/

/*c{

#define set_tos( t, n, v ) set( TOS, t, n, v )

}*/

let count_dirty_destinations = 0;
let count_clean_destinations = 0;

function clear_destination( c : Cell ){
  // WIP: get rid of clearing destinations, assuming they are empty already
  if( de ){
    if( value_of( c ) != 0 || info_of( c ) != 0 ){
      count_dirty_destinations++;
    }else{
      count_clean_destinations++;
    }
  }
  clear( c );
};


function copy_cell( source : Cell, destination : Cell ){
// Copy the content of a cell, handling references.

  clear_destination( destination );

  init_copy_cell( destination, source );

  if( mem_de ){
    de&&mand_eq( type_of(  destination ), type_of(  source ) );
    de&&mand_eq( name_of(  destination ), name_of(  source ) );
    de&&mand_eq( value_of( destination ), value_of( source ) );
  }

  // If the source was a reference, increment the reference counter
  if( is_sharable( source ) ){
    // This would not be necessary if there were a classical GC.
    // However, I may implement some destructor logic when an object
    // goes out of scope and it sometimes make sense to have that logic
    // excuted immediately instead of later on as would happen with a
    // classical GC. I could also have the best of both world depending
    // on some flag set inside the referenced object.
    // ToDo: make sure copy cell is called when a destructor could be
    // executed without corrupting anything. Alternatively the queue of
    // destructors could be processed by return.
    area_lock( value_of( source ) );
  }
}


function move_cell( source : Cell, destination : Cell ){
// Move the content of a cell, taking care of clearing the destination first.
  clear_destination( destination );
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
  de&&mand( ! is_sharable( c ) );
  reset_value( c );
}


function clear_unshared_area( area : Area, typ : Type ){

  legacy_de&&mand( ! area_is_shared( area ) );

  // ToDo: optimize this, using a table of functions?
  // ToDo: asynchronomous destruction in a separate thread?

  if( typ == type_reference ){
    object_free( area );

  }else if( typ == type_text ){
    text_free( area );

  }else{
    legacy_de&&mand_type( typ, type_proxy );
    proxy_free( area );
  }

}


function clear( c : Cell ){
// Clear the content of a cell, free potentially referenced sub values

  const typ = type_of( c );

  // If value semantics, just reset the cell
  if( ! is_a_reference_type( typ ) ){
    if( legacy_de ){
      // Clearing a tag singleton?
      if( typ == type_tag && value_of( c ) == c ){
        FATAL( S()+ "clear() on " + dump( c ) );
        return;
      }
    }
    reset( c );
    return;
  }

  // Cell is either a string, a reference to an object or a proxy
  legacy_de&&mand( is_sharable( c ) );

  // At the end, they reference some dynamic area of memory
  const area = value_of( c );

  reset( c );

  // Until it is no longer referenced, that area just needs to be unlocked
  if( area_is_shared( area ) ){
    area_free( area );
    return;
  }

  // Last reference reached, need to clear the area now
  clear_unshared_area( area, typ );

}


function clear_value( c : Cell ){
// Clear the value of a cell but keep the name, type becomes void

  const info = info_of( c );
  const typ  = type_of( c );

  if( ! is_a_reference_type( typ ) ){
    reset( c );
    set_name( c, unpack_name( info ) );
    return;
  }

  // Cell is either a string, a reference or a proxyconst
  const area = value_of( c );

  reset( c );
  set_name( c, unpack_name( info ) );

  // Both references and proxies have a reference counter
  if( area_is_shared( area ) ){
    area_free( area );
    return;
  }

  // Last reference reached, need to free the area
  clear_unshared_area( area, typ );

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
 *    - the string,     a Text in C++, a string in TypeScript
 *    - the primitive,  a void (fn)( void ) in C++, a function in TypeScript
 *    - the definition, a 28 bits address of the first cell of the definition
 *
 *  This makes a total of 4 x 32 bits words per symbol if compiled for 32 bits
 *  and 2 x 32 bits + 2 x 64 bits words per symbol if compiled for 64 bits. ie
 *  16 bytes per symbol if compiled for 32 bits and 24 bytes per symbol if
 *  compiled for 64 bits. In a addition to that there is the space for the
 *  strings themselves plus the overhead of malloc() about that. That's for
 *  C++, the TypeScript version is a bit different.
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
// In TypeScript, those are strings, in C++, it's LearnString objects
/**/ let all_symbol_texts : Array< string >;
//c/ static Text* all_symbol_texts = 0;

// The associated array of definitions, if any
/**/ let    all_definitions : Array< Cell >;
//c/ static Cell*  all_definitions = (Cell*) 0;

// It becomes a stack object during the bootstrap
let all_definitions_stack = 0;

// The associated array of primitives, if any
/**/ let all_primitives : Array< Primitive >;
//c/ static Primitive* all_primitives = (Primitive*) 0;

// It becomes a stack object during the bootstrap
let all_primitives_stack = 0;

// TypeScript grows arrays automatically, C++ does not
// ToDo: get rid of this once upgrade_symbols() works
//c/ static Length all_primitives_capacity  = 0;
//c/ static Length all_definitions_capacity = 0;

//c/ Tag tag( TxtC );


/*
 *  Init all of that
 */


function init_symbols() : Index {
// Initialize the global arrays of all symbols

  // See tables below, from "void" to "stack", 21 symbols
  all_symbol_cells_length = 21;

  // ToDo: test with a smaller value
  all_symbol_cells_capacity = INOX_SYMBOL_TABLE_SIZE;
  //c/ all_primitives_capacity  = all_symbol_cells_capacity;
  //c/ all_definitions_capacity = all_symbol_cells_capacity;

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

  /*ts{*/
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
      "text",       // 8
      "flow",       // 9
      "list",       // 10
      "invalid",    // 11 - room for future types
      "invalid2",   // 12
      "invalid3",   // 13
      "invalid4",   // 14
      "invalid5",   // 15
      "_dynsz",     // 16 - dynamic area allocator related
      "_dynrc",     // 17 - dynamic area allocator related
      "_dynxt",     // 18 - dynamic area allocator related
      "true",       // 19 - misc
      "stack",      // 20
    ];
    // ToDo: I should use a stack for that too
    all_primitives  = [];
    all_definitions = [];
    for( let ii = 0 ; ii < all_symbol_cells_capacity ; ii++ ){
      all_primitives[  ii ] = no_operation;
      all_definitions[ ii ] = 0;
    }
  /*}*/
  /*c{
    // ToDo: Area needs to be clear, see calloc() maybe?
    // Alternatively I could allocate within the symbol table or in a dyn area
    //all_symbol_texts
    //= (char**) calloc( all_symbol_cells_capacity, sizeof( char* ) );
    // ToDo: DRY
    all_symbol_texts = new Text[ all_symbol_cells_capacity ];
    all_symbol_texts[  0 ] = "void";
    all_symbol_texts[  1 ] = "boolean";
    all_symbol_texts[  2 ] = "tag";
    all_symbol_texts[  3 ] = "integer";
    all_symbol_texts[  4 ] = "verb";
    all_symbol_texts[  5 ] = "float";
    all_symbol_texts[  6 ] = "reference";
    all_symbol_texts[  7 ] = "proxy";
    all_symbol_texts[  8 ] = "text";
    all_symbol_texts[  9 ] = "flow";
    all_symbol_texts[ 10 ] = "list";
    all_symbol_texts[ 11 ] = "invalid";
    all_symbol_texts[ 12 ] = "invalid2";
    all_symbol_texts[ 13 ] = "invalid3";
    all_symbol_texts[ 14 ] = "invalid4";
    all_symbol_texts[ 15 ] = "invalid5";
    all_symbol_texts[ 16 ] = "_dynsz";
    all_symbol_texts[ 17 ] = "_dynrc";
    all_symbol_texts[ 18 ] = "_dynxt";
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

  // tag_list = tag( "list" );
  // Can't use tag() yet, because of LeanString. Hence it is hardcoded
  de&&mand_eq( tag_list, 10 );
  return 1;
}


function upgrade_symbols(){
// Upgrade the global arrays of all symbols into real stack objects

  // ToDo: not called yet
  debugger;

  // First the tag to text table
  const new_symbols = stack_preallocate( all_symbol_cells_length );
  let ii;
  let symbol_tag = 0;
  let auto_symbol_text = S();
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    symbol_tag = name_of( all_symbol_cells + ii * ONE );
    auto_symbol_text = tag_to_text( symbol_tag );
    set_text_cell( the_tmp_cell, auto_symbol_text );
    set_name( the_tmp_cell, symbol_tag );
    stack_push( new_symbols, the_tmp_cell );
  }

  // Then the tag to definition table
  const new_definitions = stack_preallocate( all_symbol_cells_length );
  let symbol_definition = 0;
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    symbol_tag = name_of( all_symbol_cells + ii * ONE );
    symbol_definition = definition_of( symbol_tag );
    set( the_tmp_cell, type_verb, symbol_tag, symbol_definition );
    stack_push( new_definitions, the_tmp_cell );
  }

  // Then the tag to primitive table
  /* ToDo: cannot cast a function pointer to a void pointer in WASM
  const new_primitives = stack_preallocate( all_symbol_cells_length );
  let auto_symbol_primitive = primitive_noop;
  let primitive_proxy = 0;
  for( ii = 0 ; ii < all_symbol_cells_length ; ii++ ){
    symbol_tag = name_of( all_symbol_cells + ii * ONE );
    auto_symbol_primitive = get_primitive( symbol_tag );
    primitive_proxy = make_proxy( auto_symbol_primitive );
    set( the_tmp_cell, type_proxy, symbol_tag, primitive_proxy );
    stack_push( new_primitives, the_tmp_cell );
  }
  */

  // Clear the old global arrays
  for( ii = 0 ; ii < all_symbol_cells_capacity ; ii++ ){
    clear( all_symbol_cells + ii * ONE );
  }
  cells_free( all_symbol_cells, all_symbol_cells_capacity );
  // C++ version needs to free the other arrays too
  /*c{
    delete all_symbol_texts;
    delete all_primitives;
    delete all_definitions;
  }*/

  // Now we can replace the global arrays with the new stacks
  all_symbol_cells = new_symbols;
  all_definitions_stack = new_definitions;
  // ToDo: all_primitives_stack  = new_primitives;

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
const tag_stack     = tag( "stack" );


function tag_to_text( t : Tag ) : Text {
// Return the string value of a tag
  de&&mand( tag_is_valid( t ) );
  if( ! tag_is_valid( t ) ){
    return S()+ "invalid-tag-" + N( t );
  }
  return all_symbol_texts[ t ];
}


function symbol_to_text( c : Cell ) : Text {
// Return the string value of a cell
  de&&mand_eq( type_of( c ), type_tag );
  de&&mand_eq( name_of( c ), value_of( c ) );
  return all_symbol_texts[ value_of( c ) ];
}


function symbol_lookup( name : TxtC ) : Index {
// Return the entry number of a symbol, or 0 if not found
  // Starting from the end
  let ii = all_symbol_cells_length;
  while( --ii ){
    /*ts{*/
    if( teq( symbol_to_text( all_symbol_cells + ii * ONE ), name ) ){
      return ii;
    }
    /*}*/
    /*c{
      if( strcmp( all_symbol_texts[ ii ].c_str(), name ) == 0 ){
        return ii;
      }
    }*/
  }
  return 0;
  // ToDo: speed this up with a hash table
}


function register_symbol( name : TxtC ) : Index {
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
    cells_free( all_symbol_cells, all_symbol_cells_capacity );
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
  all_symbol_texts[ all_symbol_cells_length ] = name;
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
/**/ function    no_operation()       : void { /* Does nothing */ }
//c/ static void no_operation( void )        {                    }


function  get_primitive( t : Tag ) : Primitive {
// Return the primitive function for a tag, default is no_operation
  de&&mand( t < all_symbol_cells_length );
  /*ts{*/
    return all_primitives[ t ] || no_operation;
  /*}*/
  /*c{
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

// Now that the symbol table is initialized, that ends phase 1 of the boot
let init_area_allocator_done = init_area_allocator();


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

function stack_allocate( len : Length ) : Cell {
// Allocate a stack of length l
  // First cell holds the length of the stack and it's class name
  const area = allocate_area( ( len + 1 ) * size_of_cell );
  // If stack is extensible, ie has an initial length of 0
  if( len == 0 ){
    // Then first cell is a reference to some other stack that may change
    set( area, type_reference, tag_stack, stack_allocate( len ) ); // one cell
  // If stack isn't extensible, then first cell is the length of the stack
  }else{
    set( area, type_integer, tag_stack, 0 );
    de&&mand_eq( stack_length( area ), 0 );
  }
  de&&mand_eq( stack_length( area ), 0 );
  // ToDo: should return a + ONE maybe, ie skip the header first cell?
  return area;
}


function stack_preallocate( len : Length ) : Cell {
// Allocate an extensible stack with an initial capacity
  const a = allocate_area( 1 * size_of_cell );
  set( a, type_reference, tag_stack, stack_allocate( len ) );
  de&&mand_eq( stack_length( a ), 0 );
  return a;
}


function stack_clear( stk : Area ){
// Empty the entire stack, don't deallocate it however
  let ptr;
  let len;
  let ii;
  // Dereference if stack is extended
  if( stack_is_extended( stk ) ){
    ptr = value_of( stk );
  }else{
    ptr = stk;
  }
  // First cell is the length of the stack
  de&&mand_cell_type( ptr, type_integer );
  len = value_of( ptr );
  for( ii = 0 ; ii < len ; ii++ ){
    clear( ptr + ( ii + 1 ) * ONE );
    // ToDo: optimize with some clears() function
  };
  // Set length to 0
  de&&mand_cell_type( ptr, type_integer );
  set_value( ptr, 0 );
  de&&mand_eq( stack_length( stk ), 0 );
}


function stack_free( stk : Area ) : void {
// Free a stack
  // Clear all the cells in the stack
  stack_clear( stk );
  let ptr;
  // Dereference if stack is extended
  if( stack_is_extended( stk ) ){
    ptr = value_of( stk );
    // Check that length is 0
    de&&mand_cell_type( ptr, type_integer );
    de&&mand_eq( value_of( ptr ), 0 );
    reset( ptr );
    area_free( ptr );
  }else{
    de&&mand_cell_type( stk, type_integer );
    de&&mand_eq( value_of( stk ), 0 );
  }
  reset( stk );
  area_free( stk );
}


function stack_capacity( stk : Area ) : Length {
// Return the capacity of a stack
  // The capacity does not include the first cell that holds the length itself
  if( stack_is_extended( stk ) ){
    return area_length( value_of( stk ) ) - 1;
  }else{
    return area_length( stk ) - 1;
  }
}


function stack_length( stk : Area ) : Length {
// Return the length of a stack, ie the number of attributes
  // This does not include the first cell that holds the length itself
  let len;
  if( stack_is_extended( stk ) ){
    de&&mand_cell_type( value_of( stk ), type_integer );
    len = value_of( value_of( stk ) );
  }else{
    de&&mand_cell_type( stk, type_integer );
    len = value_of( stk );
  }
  de&&mand( len >= 0 );
  return len;
}


function stack_is_empty( stk : Area ) : boolean {
// Return true if the stack is empty
  return stack_length( stk ) == 0;
}


function stack_is_not_empty( stk : Area ) : boolean {
// Return true if the stack is not empty
  return stack_length( stk ) != 0;
}


function stack_set_length( stk : Area, len : Length ){
// Set the length of a stack
  // ToDo: what about overflow?
  if( stack_is_extended( stk ) ){
    set_value( value_of( stk ), len );
  }else{
    set_value( stk, len );
  }
}


function stack_push( stk : Area, c : Cell ){
// Push a cell on a stack, the source cell gets cleared
  const len = stack_length( stk );
  stack_put( stk, len, c );
  de&&mand_eq( stack_length( stk ), len + 1 );
}


function stack_pushes( stk : Area, c : Cell, len : Length ){
// Push an array of cells on a stack, the source cells get cleared
  let ii;
  for( ii = 0 ; ii < len ; ii++ ){
    stack_push( stk, c + ii * ONE );
  }
}


function stack_push_copy( stk : Area, c : Cell ){
// Push a cell on a stack, the source cell is not cleared
  const len = stack_length( stk );
  stack_put_copy( stk, len, c );
  de&&mand_eq( stack_length( stk ), len + 1 );
}


function stack_push_copies( stk : Area, c : Cell, len : Length ){
// Push an array of cells on a stack, the source cells are not cleared
  // ToDo: optimize this
  let ii;
  for( ii = 0 ; ii < len ; ii++ ){
    stack_push_copy( stk, c + ii * ONE );
  }
}


function stack_pop( stk : Area ) : Cell {
// Pop a cell from a stack, just returning it's address
  const i = stack_length( stk ) - 1;
  if( check_de && i < 0 ){
    FATAL( "stack_pop: stack is empty" );
  }
  const c = stack_at( stk, i );
  stack_set_length( stk, i );
  return c;
}


function stack_pop_nice( stk : Area ) : Cell {
// Pop a cell from a stack, just returning it's address, 0 if empty
  const i = stack_length( stk ) - 1;
  if( check_de && i < 0 ){
    return 0;
  }
  const c = stack_at( stk, i );
  stack_set_length( stk, i );
  return c;
}


function stack_peek( stk : Area ) : Cell {
// Peek at the top of a stack, ie the last cell
  let ptr;
  if( stack_is_extended( stk ) ){
    ptr = value_of( stk );
  }else{
    ptr = stk;
  }
  // base + length works because cell 0 is the length
  return ptr + value_of( ptr ) * ONE;
}


function stack_dup( stk : Area ) : Cell {
// Duplicate the top of a stack
  const c = stack_peek( stk );
  stack_push_copy( stk, c );
  return c;
}


function stack_at( stk : Area, i : Index ) : Cell {
// Get the i-th cell from a stack
  let addr;
  // ToDo: handle negative indices?
  // Must be length 1 to hold item 0, hence the + 1
  stack_extend( stk, i + 1 );
  if( stack_is_extended( stk ) ){
    addr = value_of( stk ) + ( i + 1 ) * ONE;
  }else{
    addr = stk + ( i + 1 ) * ONE;
  }
  return addr;
}


function stack_put( stk : Area, i : Index, src : Cell ){
// Set the i-th cell from a stack, the source cell gets cleared
  move_cell( src, stack_at( stk, i ) );
}


function stack_put_copy( stk : Area, i : Index, src : Cell ){
// Set the i-th cell from a stack, the source cell is not cleared
  copy_cell( src, stack_at( stk, i ) );
}


function stack_dump( stk : Area ) : Text {
// Dump a stack
  // "[ ]" is the empty stack
  const len = stack_length( stk );
  let auto_r = S();
  // ToDo: a JSON style format, TLV probably
  auto_r += "[ ";
  let ii;
  for( ii = 0 ; ii < len ; ii++ ){
    auto_r += dump( stack_at( stk, ii ) ) + " ";
  }
  auto_r += "]";
  return auto_r;
}


function stack_split_dump( stk : Area, nth : Index ) : Text {
// Dump a stack, with a newline every nth item
  // "[ ]" is the empty stack
  const len = stack_length( stk );
  let auto_r = S();
  // ToDo: a JSON style format, TLV probably
  auto_r += "[ ";
  let ii;
  for( ii = 0 ; ii < len ; ii++ ){
    if( ii % nth == 0 ){
      auto_r += "\n";
    }
    auto_r += short_dump( stack_at( stk, ii ) ) + " ";
  }
  auto_r += "]";
  return auto_r;
}


function stack_lookup_by_name( stk : Area, n : ConstText ) : Cell {
// Lookup a cell in a stack by name
  const len = stack_length( stk );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = len ; ii > 0 ; ii-- ){
    const c = stack_at( stk, ii - 1 );
    if( teq( n, tag_to_text( name_of( c ) ) ) ){
      return c;
    }
  }
  // If the attribute is not found, void is returned
  return 0;
}


function stack_lookup_by_tag( stk : Area, tag : Tag ) : Cell {
// Lookup a cell in a stack by tag
  const len = stack_length( stk );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = len ; ii > 0 ; ii-- ){
    const c = stack_at( stk, ii - 1 );
    if( tag == name_of( c ) ){
      return c;
    }
  }
  // If the attribute is not found, void is returned
  return 0;
}


function stack_update_by_name( stk : Area, n : ConstText ){
// Update a cell using the tos cell, by name.
  const l = stack_length( stk );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const c = stack_at( stk, ii - 1 );
    if( teq( n, tag_to_text( name_of( c ) ) ) ){
      stack_put( stk, ii - 1, stack_peek( stk ) );
      stack_pop( stk );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_name, attribute not found,"
    + n
  );
}


function stack_update_by_value( stk : Area, c : Cell ){
// Update a cell using the tos cell, by value
  const len = stack_length( stk );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = len ; ii > 0 ; ii-- ){
    const a = stack_at( stk, ii - 1 );
    if( a == c ){
      stack_put( stk, ii - 1, stack_peek( stk ) );
      stack_pop( stk );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_value, attribute not found,"
    + C( c )
  );
}


function stack_update_by_tag( stk : Area, tag : Tag ){
// Update a cell using the tos cell, by tag
  const l = stack_length( stk );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = l ; ii > 0 ; ii-- ){
    const c = stack_at( stk, ii - 1 );
    if( tag == name_of( c ) ){
      stack_put( stk, ii - 1, stack_peek( stk ) );
      stack_pop( stk );
      return;
    }
  }
  FATAL( S()
    + "stack_update_by_tag, attribute not found, "
    + tag_to_text( tag )
  );
}


function stack_contains_cell( stk : Area, c : Cell ) : boolean {
// Check if a stack contains a cell
  const len = stack_length( stk );
  let ii = len;
  while( --ii >= 0 ){
    const a = stack_at( stk, ii );
    if( a == c ){
      return true;
    }
  }
  return false;
}


function stack_contains_name( stk : Area, n : ConstText ) : boolean {
// Check if a stack contains a cell by name
  const len = stack_length( stk );
  let ii = len;
  while( --ii >= 0 ){
    const c = stack_at( stk, ii );
    if( teq( n, tag_to_text( name_of( c ) ) ) ){
      return true;
    }
  }
  return false;
}


function stack_contains_tag( stk : Area, tag : Tag ) : boolean {
// Check if a stack contains a cell by tag
  const len = stack_length( stk );
  let ii = len;
  while( --ii >= 0 ){
    const c = stack_at( stk, ii );
    if( tag == name_of( c ) ){
      return true;
    }
  }
  return false;
}


function stack_resize( stk : Area, len : Length ) : Cell {
// Return a copy of a stack with a new capacity, clear the old stack
  const new_stack = stack_allocate( len );
  let max = stack_length( stk );
  if( max < len ){
    max = len;
  }
  let ii;
  for( ii = 0 ; ii < max ; ii++ ){
    move_cell( stack_at( stk, ii ), stack_at( new_stack, ii ) );
  }
  stack_free( stk );
  stack_set_length( new_stack, max );
  return new_stack;
}


function stack_rebase( stk : Area ) : Cell {
// Return a fixed size copy of a stack, clear the old stack
  return stack_resize( stk, stack_length( stk ) );
}


function stack_is_extended( stk : Area ) : boolean {
// Check if a stack is extended, ie extensible
  return type_of( stk ) == type_reference;
}


function stack_extend( stk : Area, len : Length ){
// Extend a stack with a new capacity if needed, clear the old stack
  if( len <= stack_capacity( stk ) ){
    if( len > stack_length( stk ) ){
      stack_set_length( stk, len );
    }
    return;
  }
  if( ! stack_is_extended( stk ) ){
    FATAL( "Can't extend a non extensible stack" );
  }
  const capacity = stack_capacity( stk );
  let new_capacity = capacity;
  while( new_capacity < len ){
    new_capacity = new_capacity * 2;
  }
  const old_stack = value_of( stk );
  const new_stack = stack_resize( old_stack, new_capacity );
  stack_free( old_stack );
  set_value( stk, new_stack );
  de&&mand( stack_is_extended( stk) );
  if( len > stack_length( stk ) ){
    stack_set_length( stk, len );
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
  return tag_is_valid( symbol_lookup( n ) );
}


function tag_is_valid( id : Tag ) : boolean {
// True if tag was internalized
  // <= vs < because register_symbol() calls this function before incrementing
  const is_valid = ( id >= 0 && id <= all_symbol_cells_length );
  if( ! is_valid ){
    debugger;
    if( bootstrapping ){
      return true;
    }else{
      return false;
    }
  }
  return is_valid;
}


function set_tag_cell( c : Cell, n : Tag ){
  set( c, type_tag, n, n );
}


function set_verb_cell( c : Cell, n : Tag ){
  set( c, type_verb, n, 0 );
}


/**/ const   the_void_cell = 0; // tag_singleton_cell_by_name( "void" );
//c/ #define the_void_cell   0


/* -----------------------------------------------------------------------
 *  Integer, 32 bits
 *  ToDo: Double integers, 64 bits.
 *  ToDo: type_f64, type_bigint
 */

function set_integer_cell( c : Cell, v : Value ){
  set( c, type_integer, tag_integer, v );
}


function is_an_integer_cell( c : Cell ) : boolean {
  return type_of( c ) == type_integer;
}


function cell_integer( c : Cell ) : Value {
  de&&mand_eq( type_of( c ), type_integer );
  return value_of( c );
}


/* -----------------------------------------------------------------------
 *  Float, 32 bits
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
  return type_of( c ) == type_float;
}


function cell_float( c : Cell ) : Float {
  de&&mand_eq( type_of( c ), type_float );
  /**/ return value_of( c );
  // For TypeScript, use mem32f
  //a/ return mem32f[ ( c << 1 ) ];
  //c/ return *( ( Float * ) ( c << 4 ) );
}


/* -----------------------------------------------------------------------
 *  Reference, 32 bits to reference a dynamically allocated array
 *  of cells, aka a smart pointer to an Inox object.
 */

function set_reference_cell( c : Cell, v : Value ){
  set( c, type_reference, tag_reference, v );
}


function cell_reference( c : Cell ) : Value {
  check_de&&mand_eq( is_a_reference_cell( c ) ? 1 : 0, 1 );
  return value_of( c );
}


/* -----------------------------------------------------------------------
 *  Text type
 *  Uses LeanString style objects with a char* that
 *  is the result of some allocate_bytes() call.
 */

function set_text_cell( c : Cell, txt : ConstText ){
  if( tlen( txt ) == 0 ){
    alloc_de&&mand( area_is_busy( the_empty_lean ) );
    // ToDo: precompute info_text_text and use init_cell()
    set( c, type_text, tag_text, the_empty_lean );
    // copy_cell( the_empty_text_cell, c );
    return;
  }
  /**/ const str = lean_new_from_native( txt );
  /*c{
    Cell str = to_cell( txt.c_str() );
    lean_lock( str );
  }*/
  set( c, type_text, tag_text, str );
  de&&mand( cell_looks_safe( c ) );

  // ToDo: handle utf-8
  /*ts{*/
    if( de ){
      const txt1 = cell_to_text( c );
      if( txt != txt1 ){
        if( txt.length != txt1.length ){
          debugger;
          for( let ii = 0; ii < txt.length; ii++ ){
            const ch = txt[ ii ];
            const ch1 = txt1[ ii ];
            if( txt[ ii ] != txt1[ ii ] ){
              const sub = txt.substring( ii - 10, ii + 10 );
              debugger;
              break;
            }
          }
        }
        debugger;
        cell_to_text( c );
      }
    }
  /*}*/

  de&&mand( teq( cell_to_text( c ), txt ) );
}


function text_free( oid : Area ){
  lean_free( oid );
}


/* -----------------------------------------------------------------------------
 *  Some global cells
 */

function init_the_empty_text_cell() : Index {
  the_empty_text_cell = allocate_cell();
  // ToDo: precompute the_empty_lean to avoid a test in lean_new_empty()
  const empty_lean_string = lean_new_empty();
  set(
    the_empty_text_cell,
    type_text,
    tag( "the-empty-text" ),
    empty_lean_string
  );
  // It's only now that testing the area allocator is possible.
  area_test_suite();
  return 1;
}
let init_the_empty_text_cell_done = init_the_empty_text_cell();


// Now it is possible to do some more smoke tests

function lean_string_test() : Index {
  // Test the string functions
  const str1 = lean_new_from_native( "Hello" );
  const str2 = lean_new_from_native( "World" );
  const str3 = lean_new_from_strcat( str1, str2 );
  const str4 = lean_new_from_native( "HelloWorld" );
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

/*
 *  Some more basic tests
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
static bool tbad( const Text& actual, const Text& expected ){
  if( actual == expected )return false;
  trace( S()
    + "tbad: actual: " + actual
    + " vs expected: " + expected
  );
  debugger;
  if( actual != expected )return false;
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


/* -----------------------------------------------------------------------
 *  Object type
 */


function object_free( area : Area ){
// Clear an object that is no longer referenced

  let ptr;

  // Add a level of indirection if object is extensible
  if( type_of( area ) == type_reference ){
    ptr = reference_of( area );
    reset( area );
    area_free( area );
  }else{
    ptr = area;
  }

  // ToDo: avoid recursion?
  // This can take a long time, not real time safe
  // A solution could be to "queue" the object and free it later.
  // This would destroy the "destructor" logic however.
  // Maybe the destructor logic could be implemented in a different way.
  // For example with a flag about the semantic of the object.
  // This could be a "per class" attribute.
  // For the case where the cleaning is queued, there are issues
  // with the size of the queue and some incremental tree walking logic
  // may be needed to avoid the queue to grow too much.
  // Overall, this renforces the idea that some "background" logic
  // should be implemented, for various reasons including memory
  // management, event dispatching, interruptions handling, timers,
  // etc. This would be a good reason to implement a new version
  // of the LinkOS kernel, l9.
  // Note: there is plenty of room to add flags to references because
  // the reference itself is a 28 bits address. The 4 bits left
  // could be used for flags.
  // This could be used to increase the number of types with a
  // distinction between "by value" and "by reference" types.
  // Among the "by reference" types, there could be a distinction
  // between "by reference with value semantics" and "by reference
  // with reference semantics". The current implementation of the
  // text type is an example of "by reference with value semantics".
  // There is a need for a generic array type, which would be like
  // text but with arbitrary elements, either of the same type
  // or heterogeneous. Much like a StringView makes sense for text,
  // an ArrayView would make sense for arrays. This would also make
  // sense for lists or any ordered collection.

  const length = object_length( ptr );
  let ii;
  for( ii = 0 ; ii < length ; ii++ ){
    clear( ptr + ii * ONE );
  }
  area_free( ptr );

}


/* -----------------------------------------------------------------------
 *  Proxy opaque object
 *  These objects are platform provided objects. Access is done using an
 *  indirection table.
 *  ToDo: implement using dynamically allocated bytes.
 *  ToDo: define a base class to be derived by more specific classes.
 *
 *  class AbstractProxy {
 *
 *    void new_from_value( Cell there, Cell value ){
 *      // Create a proxy object from a value.
 *    }
 *
 *    void to_value( Cell there ){
 *      // Serialize the object to a value, ready for from_value().
 *    }
 *
 *    void new_from_stack( Cell there, Cell stack ){
 *      // Create a proxy object from the stack.
 *    }
 *
 *    void new_from_array( Cell there, Cell array, Length count ){
 *      // Create a proxy object from an array.
 *    }
 *
 *    void to_stack( Cell stack ){
 *      // Serialize the object to the stack, ready for new_from_stack().
 *    }
 *
 *    void to_array( Cell there ){
 *      // Serialize the object to an array, ready for new_from_array().
 *    }
 *
 *    void new_from_queue( Cell there, Cell queue ){
 *      // Create a proxy object from a queue.
 *    }
 *
 *    void to_queue( Cell queue ){
 *      // Serialize the object to a queue, ready for from_queue().
 *    }
 *
 *    void when_referenced(){
 *      // Called when a new reference to the object is created.
 *    }
 *
 *    void when_dereferenced(){
 *      // Called when a reference to the object disappears
 *    }
 *
 *    void when_last_referenced(){
 *      // Called when the last reference to the object disappears
 *    }
 *
 *    void* payload(){
 *     // Return a pointer to the payload of the object.
 *    }
 *
 *    void set_payload( void* payload ){
 *      // Set the payload of the object, if possible
 *    }
 *
 *    boolean can_set_payload(){
 *     // Return true if the payload can be set.
 *    }
 *
 *    Tag class_tag(){
 *      // Return the tag of the class of the object.
 *    }
 *
 *    Text as_text(){
 *      // Return a text representation of the object.
 *    }
 *
 *    Text dump(){
 *      // Return a text representation of the object.
 *    }
 *
 *    boolean as_boolean(){
 *      // Return a boolean representation of the object.
 *    }
 *
 *    void invoke( Tag method ){
 *      // Invoke a method on the object.
 *    }
 *
 *    void implements( Tag method ){
 *      // Return true if the object implements the verb.
 *    }
 *
 *    boolean is_primitive( Tag method ){
 *     // Return true if the method is a a primtive
 *    }
 *
 *    Tag method( Tag method ){
 *      // Return the name of the verb that implements the method.
 *    }
 *
 *    Cell definition_of( Tag method ){
 *      // Return the definition of the verb that implements the method.
 *    }
 *
 *    int hash(){
 *     // Return a hash of the object.
 *    }
 *
 *    Cell clone(){
 *     // Return a clone of the object.
 *    }
 *
 *    bool equals( Cell other ){
 *      // Return true if the object is equal to the other object.
 *    }
 *
 *    int compare( Cell other ){
 *      // Return -1, 0, 1 depending on order
 *    }
 *
 *    void assign( Cell other ){
 *      // Assign a new "value" to the object
 *    }
 *
 *    void get_attribute( Tag attribute ){
 *      // Get an attribute of the object
 *    }
 *
 *    void set_attribute( Tag attribute, Cell value ){
 *      // Set an attribute of the object
 *    }
 *
 *    void has_attribute( Tag attribute ){
 *      // Return true if the object has the attribute
 *    }
 *    boolean can_set_attribute( Tag attribute ){
 *      // Return true if the attribute can be set.
 *    }
 *
 *    Length length(){
 *      // Return the length of the object
 *    }
 *
 *    Cell at( Index index ){
 *      // Return the element at the index
 *    }
 *
 *    void set_at( Index index, Cell value ){
 *      // Set the element at the index
 *    }
 *
 *  }
 *
 *
 */

// Access to proxied object is opaque, there is an indirection.
// Each object has an id which is a cell address. Cells that
// reference proxied object use that cell address as a pointer.
// Indirection table to get access to an object using it's id.
// The id is the address of a dynamically allocated cell that is
// freed when the reference counter reaches zero.
// When that happens, the object is also deleted from the map.

// In TypeScript, there is a parallel map, in C++, a cell is used
/**/ let all_proxied_objects_by_id = new Map< Cell, any >();

//c/ static Tag tag_c_string = tag( "c_string" );

function make_proxy( object : any ) : Index {
  // In C++, the object is a char* that points to a dynamically allocated area
  /*c{
    int area = to_cell( object );
    area_lock( area );
  }*/
  // In TypeScript there is map between the id and the native object
  /*ts{*/
    const area = allocate_area( 0 );
    all_proxied_objects_by_id.set( area, object );
  /*}*/
  return area;
}


function set_proxy_cell( c : Cell, area : Area ){
  alloc_de&&mand( area_is_busy( area ) );
  set(
    c,
    type_proxy,
    /**/ tag( proxied_object_by_id( area ).constructor.name ),
    //c/ tag_c_string,
    area
  );
}


function proxy_free( proxy : Area ){
// This is called by clear_cell() when reference counter reaches zero
  alloc_de&&mand( area_is_busy( proxy ) );
  // ToDo: should call proxy.when_last_referenced()
  /**/ all_proxied_objects_by_id.delete( proxy );
}


function proxied_object_by_id( id : Area ) : any {
  alloc_de&&mand( area_is_busy( id ) );
  /**/ return all_proxied_objects_by_id.get( id );
  // ToDo: should return a pointer to an AbstractProxy instance
  //c/ return (const void*) value_of( id );
}


function cell_proxied_object( c : Area ) : any {
  const area = value_of( c );
  alloc_de&&mand( area_is_busy( area ) );
  // ToDo: should return a pointer to an AbstractProxy instance
  /**/ return proxied_object_by_id( area );
  //c/ return (const void*) value_of( area );
}


function proxy_to_text( area : Area ) : Text {
  alloc_de&&mand( area_is_busy( area ) );
  // Some special case 0 produces the empty text.
  if( !area )return no_text;
  /*ts{*/
    if( !all_proxied_objects_by_id.has( area ) ){
      if( de ){
        bug( S()+ "Attempt to convert a non proxy object to text" );
        debugger;
      }
      return "";
    }
    let obj = all_proxied_objects_by_id.get( area );
    // ToDo: should invoke proxy.to_text()
    return obj.toString ? obj.toString() : "";
  /*}*/
  /*c{
    de&&mand_cell_name( area, tag_c_string );
    return TxtD( (const char*) value_of( area ) );
  }*/
}


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
 *  ToDo: does name less? or is "to no-name ... ;" enough?
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
    type_of(  the_default_verb_definition_value ),
    name_of(  the_default_verb_definition_value  ),
    value_of( the_default_verb_definition_value  )
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
    debugger;
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


function definition_of( id : Index  ) : Cell {
// Given a verb, as a tag, return the address of its definition
  const def = find_definition( id );
  if( def != get_definition( id ) ){
    debugger;
    get_definition( id );
    find_definition( id );
  }
  de&&mand_eq( def, get_definition( id ) );
  return def;
}


function definition_by_name( n : ConstText ) : Cell {
  if( !tag_exists( n ) ){
    return the_default_verb_definition;
  }
  return definition_of( tag( n ) );
}


const verb_flags_mask     = 0xff00000; // Mask for all flags
const verb_length_mask    = 0x00fffff; // Mask for length
const max_block_length    =   0xfffff; // Max length of a block, 20 bits


function mand_definition( def : Cell ) : boolean {
  // The header with length & flags is right before the code
  const header = def - ONE;
  if( type_of( header ) == type_integer )return true;
  const n = name_of( header );
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
  const length = value_of( header ) & verb_length_mask;
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
  const flags = value_of( header ) & verb_flags_mask;
  set_value( header, flags | length );
}


/* -----------------------------------------------------------------------
 *  class/method lookup
 */

// TypeScript version
/*ts{*/

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

/*}*/


// C++ version
/*c{

#define METHOD_CACHE_LENGTH 1009 // A prime number
static Tag  class_cache[      METHOD_CACHE_LENGTH ];
static Tag  method_cache[     METHOD_CACHE_LENGTH ];
static Cell definition_cache[ METHOD_CACHE_LENGTH ];

static Count cache_hits = 0;
static Count cache_misses = 0;


static void cache_method( Tag klass, Tag method, Cell def ){
  // ToDo: implement using some better hash function
  const hashcode = ( ( klass << 13 ) + method ) % METHOD_CACHE_LENGTH;
  class_cache[      hashcode ] = klass;
  method_cache[     hashcode ] = method;
  definition_cache[ hashcode ] = def;
}


static Cell find_method( Tag class_tag, Tag method_tag ){
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
  const header = definition_of( id ) - ONE;
  set_value( header, ( value_of( header ) & verb_length_mask ) | flag );
}


function test_verb_flag( id : InoxWord, flag : Value ) : Index {
  const header = definition_of( id ) - ONE;
  return ( value_of( header ) & flag ) == flag ? 1 : 0;
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
  return name_of( c ) == tag_block_header;
}


function is_block_ip( ip : Cell ) : boolean {
  de&&mand_cell_name( ip, tag_block_header );
  return ( value_of( ip ) & block_verb_flag ) != 0;
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
false, false, false, false,
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


function is_a_reference_type( t : Type ) : boolean {
  // ToDo: faster t >= type_reference?
  return is_reference_type_array[ t ];
}


function is_sharable( c : Cell ) : boolean {
  return is_a_reference_type( type_of( c ) );
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

function mand_type( actual : Type, expected : Type ) :boolean {
  if( actual == expected )return true;
  if( bootstrapping )return mand_eq( actual, expected );
  let auto_msg = S();
  auto_msg += "Bad type, "    + N( actual )   + "/" + type_to_text( actual   );
  auto_msg += " vs expected " + N( expected ) + "/" + type_to_text( expected );
  bug( auto_msg );
  return mand_eq( actual, expected );
}


function mand_name( actual : Index, expected : Index ) : boolean {
  if( actual == expected )return true;
  if( bootstrapping )return mand_eq( actual, expected );
  let auto_msg = S();
  auto_msg += "Bad name, "    + N( actual )   + " /" + tag_to_text( actual   );
  auto_msg += " vs expected " + N( expected ) + " /" + tag_to_text( expected );
  bug( auto_msg );
  return mand_eq( actual, expected );
}


function mand_cell_type( c : Cell, type_id : Type ) : boolean {
// Assert that the type of a cell is the expected type.
  const actual_type = type_of( c );
  if( actual_type == type_id )return true;
  let auto_msg = S();
  auto_msg += "Bad type for cell " + C( c );
  auto_msg += ", expected " + N( type_id )
  + "/" + type_to_text( type_id );
  auto_msg += " vs actual " + N( actual_type )
  + "/" + type_to_text( actual_type );
  bug( auto_msg );
  // ToDo: should raise a type error
  return mand_type( type_of( c ), type_id );
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
  const block = value_of( c );
  // Block have an header that is the block's length & flags
  return mand_cell_type( block - ONE, type_integer );
}


function mand_cell_name( c : Cell, n : Tag ) : boolean{
// Assert that the type of a cell is the expected type.
  const actual_name = name_of( c );
  if( actual_name == n )return true;
  if( bootstrapping )return mand_name( actual_name, n );
  let auto_msg = S();
  auto_msg += "Bad name for cell " + C( c );
  auto_msg += ", expected " + N( n )
  + " /" + tag_to_text( n );
  auto_msg += " vs actual " + N( actual_name )
  + " /" + tag_to_text( actual_name );
  bug( auto_msg );
  // ToDo: should raise a type error
  return mand_name( name_of( c ), n );
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


function eat_raw_value( c : Cell ) : Index {
  // Like value_of() but also clear the cell, assuming it is not a reference
  const v = value_of( c );
  reset( c );
  return v;
}


function get_tag( c : Cell ) : Index {
// Like value_of() but check that the cell is a tag
  check_de&&mand_tag_cell( c );
  return value_of( c );
}

function get_integer( c : Cell ) : Index {
// Like value_of() but check that the cell is an integer
  check_de&&mand_integer( c );
  return value_of( c );
}


function eat_tag( c : Cell ) : Tag {
// Like eat_raw_value() but check that the cell is a tag
  check_de&&mand_tag( c );
  return eat_raw_value( c );
}


function eat_integer( c : Cell ) : Index {
// Like eat_raw_value() but check that the cell is an integer
  check_de&&mand_integer( c );
  return eat_raw_value( c );
}


function eat_boolean( c : Cell ) : Index {
// Like eat_raw_value() but check that the cell is a boolean
  check_de&&mand_boolean( c );
  return eat_raw_value( c );
}


function eat_value( c : Cell ) : Index {
// Like value_of() but also clear the cell
  const v = value_of( c );
  clear( c );
  return v;
}


function pop_raw_value() : Value {
// Like eat_raw_value() but pop the cell from the stack
  return eat_raw_value( POP() );
}


function pop_value() : Value {
// Like eat_value() but pop the cell from the stack
  return eat_value( POP() );
}


function pop_block() : Cell {
// Pop a block from the stack
  check_de&&mand_block( TOS );
  return pop_raw_value();
}


function pop_tag() : Tag {
// Pop a tag from the stack
  check_de&&mand_tag( TOS );
  return pop_raw_value();
}


function pop_integer() : Value {
// Pop an integer from the stack
  check_de&&mand_integer( TOS );
  return pop_raw_value();
}


function pop_boolean() : Index {
  check_de&&mand_boolean( TOS );
  return pop_raw_value();
}


function pop_verb() : Tag {
  check_de&&mand_verb( TOS );
  const tos = POP();
  const n = name_of( tos );
  reset( tos );
  return n;
}


function get_boolean( c : Cell ) : Index {
// Like value_of() but check that the cell is a boolean
  check_de&&mand_boolean( c );
  return value_of( c );
}


function mand_reference( c : Cell ) : boolean {
// Check that the cell is a reference
  check_de&&mand( is_a_reference_cell( c ) );
  return true;
}


function pop_reference() : Cell {
  check_de&&mand_reference( TOS );
  return pop_raw_value();
}


function eat_reference( c : Cell ) : Cell {
// Like eat_value() but check that the cell is a reference
  check_de&&mand_reference( c );
  return eat_value( c );
}


function reference_of( c : Cell ) : Cell {
// Like value_of() but check that the cell is a reference
  check_de&&mand_reference( c );
  return value_of( c );
}


function pop_as_text() : Text {
// Pop a cell from the data stack and return it's text representation
  const cell = POP();
  const auto_txt = cell_to_text( cell );
  clear( cell );
  return auto_txt;
}

function eat_ip( c : Cell ) : Cell {
// Like eat_value() but check that the cell is an ip
  check_de&&mand_cell_type( c, type_ip );
  return eat_raw_value( c );
}


/* ----------------------------------------------------------------------------
 *  Helpers to push values on the stack
 */

function push_text( t : ConstText ){
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
    if( value_of( c ) == 0 && info_of( c ) == 0 )continue;

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
    if( type_of( c ) == type_void
    &&  name_of( c ) != tag( "_dynrc" ) // Not reference counter of dynamic area
    &&  name_of( c ) != tag( "_dynsz" ) // Not size of dynamic area
    &&  name_of( c ) != tag( "_dynxt" ) // Not next free cell of dynamic area
    &&  name_of( c ) != tag_list        // Not free cell in allocate_cell()'s list
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

/*ts{*/

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
  ACTOR_data_stack    = reference_of( ACTOR + 1 * ONE );
  ACTOR_control_stack = reference_of( ACTOR + 2 * ONE );
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
  if( bootstrapping ){
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
 *  The idea is to generate a valid C++ code file that includes everything
 *  needed to run an Inox program or to integrate Inox as a C library.
 */

/*ts{*/

let C_source = "#include \"inox.h\"\n#include \"inox.cpp\"\n";


function simplify_js_primitive( n : ConstText, source : ConstText ){
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

  C_source += "\nvoid " + name_of + "( void )" + s + "\n\n";
  return new_s;

}

/*}*/


/*ts{*/

function build_c_function_declaration( ts : ConstText ){
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
  // Add a "static" because nothing is exported
  new_s ="static " + new_s;
  return new_s;
}


const targets_preserve_comments = true;


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


  function replace( regex, replacement ) : boolean {
    // At most one change per line
    if( ii == last_ii )return;
    const new_line = line.replace( regex, replacement );
    if( new_line != line ){
      nchanges = nchanges + 1;
      line = new_line;
      last_ii = ii;
      // console.log( "Line " + line + "\n becomes " + new_line );
      // debugger;
      return true;
    }else{
      return false;
    }
  }

  // For each line
  let comment_start = -1;
  for( ii = 0 ; ii < len ; ii++ ){

    line = ts[ ii ];

    // Skip empty lines
    if( line == "" ){ // /^\s*$/ ) ){
      blank_lines = blank_lines + 1;
      c_source += line + "\n";
      continue;
    }

    // Leave line untouched if it is the end of a multi line comment
    if( comment_start != -1 && line.match( /^\s*\*\// ) ){
      comment_start = -1;
      if( targets_preserve_comments ){
        c_source += line + "\n";
      }else{
        c_source += "\n";
      }
      comment_lines = comment_lines + 1;
      continue;
    }

    // / * * /, rest of line is removed, it's TypeScript specific code
    if( replace( /^\s*\/\*\*\/(.*)$/, " //ts/ $1 " ) ){
      c_source += line + "\n";
      continue;
    }

    // Leave the line untouched if it is a true // comment
    if( line.match( /^\s*\/\/ / ) ){
      // This does not match the //x comments, a space is needed after //
      if( targets_preserve_comments ){
        c_source += line + " C++\n";
      }else{
        c_source += "\n";
      }
      comment_lines = comment_lines + 1;
      continue;
    }

    // Leave line untouched if it starts with *, ie inside multiline comments
    if( line.match( /^\s*\* / ) ){
      // Together with // comments, this avoids interferences with comments
      if( targets_preserve_comments ){
        c_source += line + "\n";
      }else{
        c_source += "\n";
      }
      comment_lines = comment_lines + 1;
      continue;
    }

    // Leave line untouched if it is a true mutli line comment, not a xx{
    if( line == begin
    || (  line.match( /^\s*\/\* / )
      && !line.match( /^\s*\/\*\S/ )
    ) ){
      comment_start = ii;
      if( targets_preserve_comments ){
        c_source += line + " C++\n";
      }else{
        c_source += "\n";
      }
      comment_lines = comment_lines + 1;
      continue;
    }

    // Skip comment lines?
    if( !targets_preserve_comments && comment_start != -1 ){
      c_source += "\n";
      comment_lines = comment_lines + 1;
      continue;
    }

    // Else, do some replacements

    // Turn const INOX_XXX_XXX into #define INOX_XXX_XXX
    replace(  /^const +INOX_([A-Z0-9_]+) += +(.+);(.*)$/,
      "#define INOX_$1 $2$3" );

    // Turn "let auto_" into C++ local automatic variables
    // This takes advantage of C++ type inference
    replace( /^(\s+) let +auto_/, "$1 auto auto_" );

    // Idem for "const auto_", turned into C++ local automatic variables
    replace( /^(\s+) const +auto_/, "$1 auto auto_" );

    // Turn " let" into C++ i32 local variables
    replace( /^(\s+) let /, "$1 i32 " );

    // Idem with " const", turned into i32 C++ local variables
    replace( /^(\s+) const /, "$1 i32 " );

    // Turn global "let" and "const" into C++ global static i32 variables
    replace( /^let /,   "static i32 " );
    replace( /^const /, "static i32 " );

    // //c/ lines are C++ specific lines
    replace( /^(\s*)\/\/c\/ (.*)$/, "$1$2" );

    // start of TypeScript version, ie / *ts{* /
    replace( begin + "ts{" + end,   " " + begin + "ts{" );

    // start of C++ version, ie / *c{
    replace( begin + "c{", " " + begin + "c{" + end );

    // end of TypeScript, start of C++, ie / *}{
    replace( begin + "}{", " //" + begin + "}{" + end );

    // end of TypeScript, ie / *}
    replace( begin + "}", "//}" );

    // end of C++, ie }* /
    replace( "}" + end, "//}" );

    // End of TypeScript, ie / *}* /
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
    "\nCode generated,\n  "
    + len + " total lines, including\n  "
    + comment_lines + " comment lines,\n  "
    + blank_lines + " blank lines,\n  "
    + ( len - ( comment_lines + blank_lines ) ) + " code lines,\n  "
    + nchanges + " C++ changes.\n\n  "
    + stat_allocated_areas + " total allocated areas,\n  "
    + stat_allocated_bytes + " total allocated bytes,\n  "
    + mem8.length + " bytes in mem8,\n  "
    + mem64.length + " cells,\n  "
   );

  // Now build the AssemblyScript version, much simpler

  let as_source = "";
  for( ii = 0; ii < ts.length; ii++ ){
    line = ts[ ii ]

    // / *ts* /, rest of line is removed
    .replace( /\/\*ts\*\/(.*$)/, "// ts $1 " )

    // //as/, rest of line is kept as code
    .replace( /\/\/as\/ (.*$)/, "$1 //as" );

    as_source += line + "\n";
  }

  // Done, write the AssemblyScript source code
  require( "fs" ).writeFileSync( "builds/inox.as.ts", as_source, "utf8" );

  // Build the html help file that lists all primitives
  let html_source = "<html><head><title>Inox primitives</title></head><body>";

  // Make a table of all primitives
  html_source += "<table border=1>\n<tr><th>Primitive</th><th>Code</th></tr>";

  // Scan the TypeScript source code for all primitives
  let found;
  let count_primitives = 0;
  for( ii = 0 ; ii < ts.length ; ii++ ){
    line = ts[ ii ];
    // /^  *\*  ([^\( ]+) - (.*)$/
    found = line.match( /^  *\*  ([^\( ]+) - (.*)$/ );
    if( found ){
      count_primitives++;
      let name  = found[ 1 ];
      let brief = found[ 2 ];
      html_source += "\n<tr><td>" + name + "</td><td>" + brief + "</td></tr>";
    }
  }

  // Close the table
  html_source += "\n</table>"
  + "\n<p>Found " + count_primitives + " primitives.</p>"
  + "</body></html>\n";

  // Done, write the html source code
  require( "fs" ).writeFileSync( "builds/inox.html", html_source, "utf8" );

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
  de&&mand( type_of( c ) == type_void );
  de&&mand( name_of( c ) == 0 );
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
    + ", tag id " + N( name_id )
    + ", definition at " + C( def )
  );

  // Some "defensive programming"
  de&&mand_eq(       definition_of( name_id ),  def                    );
  de&&mand_eq(   get_definition( name_id ),  definition_of( name_id )  );
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
 *  little-endian? - true if the machine is little endian
 */

const tag_is_little_endian = tag( "little-endian?" );

function primitive_is_little_endian(){
  PUSH();
  set( TOS, type_boolean, tag_is_little_endian, check_endianes_done );
}
primitive( "little-endian?", primitive_is_little_endian );


/*
 *  a-primitive? - true if TOS tag is also the name of a primitive
 */

const tag_is_a_primitive = tag( "a-primitive?" );

function primitive_is_a_primitive(){
  let tag_name = eat_tag( TOS );
  let is_a_primitive = primitive_exists( tag_name );
  set( TOS, type_boolean, tag_is_a_primitive, is_a_primitive ? 1 : 0 );
}
primitive( "a-primitive?", primitive_is_a_primitive );


/*
 *  return - jump to return address
 */

function primitive_return(){
// primitive "return" is jump to return address. Eqv R> IP!
  // ToDo: this should be primitive 0
  debugger;
  run_de&&bug( S()
    + "primitive, return to IP " + C( value_of( CSP ) )
    + " from " + C( name_of( CSP ) ) + "/" + tag_to_text( name_of( CSP ) )
  );
  debugger;
  IP = eat_ip( CSP );
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
/*P*/ set_return_cell( definition_of( tag_return ) );


function trace_context( msg : TxtC ){
  bug( S()
    + "\n" + msg
    + "\n" + stacks_dump()
    + "\nIP: " + inox_machine_code_cell_to_text( IP ) + "\n"
  );
}


/*
 *  actor - push a reference to the current actor
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
 *  switch-actor - non preemptive thread switch
 */

function primitive_switch_actor(){
  actor_restore_context( pop_reference() );
}
primitive( "switch-actor", primitive_switch_actor );


/*
 *  make-actor - create a new actor with an initial IP
 */


function primitive_make_actor(){
  // ToDo: it gets a copy of the data stack?
  const actor = make_actor( pop_integer() );
  set( PUSH(), type_reference, tag_actor, actor );
};
primitive( "make-actor", primitive_make_actor );


/*
 *  breakpoint - to break into the debugger
 */

function primitive_breakpoint(){
  breakpoint();
}
primitive( "breakpoint", primitive_breakpoint );


/*
 *  memory-dump - output a dump of the whole memory
 */

primitive( "memory-dump", memory_dump );


/*
 *  cast - change the type of a value, unsafe
 */

function primitive_cast(){
  // ToDo: use tag for type
  // ToDo: check that the type is valid
  const type = pop_raw_value();
  check_de&&mand( type >= 0 && type < type_invalid );
  /**/ set_type( TOS, type );
  //c/ set_type( TOS, (Type) type );
}
primitive( "cast", primitive_cast );


/*
 *  rename - change the name of the NOS value
 */

function primitive_rename(){
  const name = pop_raw_value();
  set_tos_name( name );
}
primitive( "rename",  primitive_rename );


// It is needed during code compilation
const tag_rename = tag( "rename" );


/*
 *  goto - jump to some absolue IP position, a branch
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
 *  a-void? - true if TOS is a void type of cell
 */

function is_a_void_cell( c : Cell ) : boolean {
  return type_of( c ) == type_void;
}

const tag_is_a_void = tag( "a-void?" );

function  primitive_is_a_void(){
  const it_is = is_a_void_cell( TOS );
  if( !it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_void, it_is ? 1 : 0 );
}
primitive( "a-void?", primitive_is_a_void );


/*
 *  a-tag? primitive
 */

function is_a_tag_cell( c : Cell ) : boolean {
  return type_of( c ) == type_tag;
}

const tag_is_a_tag = tag( "a-tag?" );

function primitive_is_a_tag(){
  const it_is = is_a_tag_cell( TOS );
  if( !it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_tag, it_is ? 1 : 0 );
}
primitive( "a-tag?", primitive_is_a_tag );


/*
 *  a-boolean? primitive
 */

function is_a_boolean_cell( c : Cell ) : boolean {
  return type_of( c ) == type_boolean;
}

const tag_is_a_boolean = tag( "a-boolean?" );

function primitive_is_a_boolean(){
  const it_is = is_a_boolean_cell( TOS );
  if( !it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_boolean, it_is ? 1 : 0 );
}
primitive( "a-boolean?", primitive_is_a_boolean );


/*
 *  an-integer? primitive
 */

const tag_is_an_integer = tag( "an-integer?" );

function primitive_is_an_integer(){
  const it_is = is_an_integer_cell( TOS );
  if( !it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_an_integer, it_is ? 1 : 0 );
}
primitive( "an-integer?", primitive_is_an_integer );


/*
 *  a-text? primitive
 */

function is_a_text_cell( c : Cell ) : boolean {
  return type_of( c ) == type_text;
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
  return type_of( c ) == type_reference;
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
  return type_of( c ) == type_verb;
}

function primitive_is_a_verb(){
  const it_is = is_a_verb_cell( TOS );
  if( !it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_verb, it_is ? 1 : 0 );
}
primitive( "a-verb?", primitive_is_a_verb );


/*
 *  a-proxy? primitive
 */

function is_a_proxy_cell( c : Cell ) : boolean {
  return type_of( c ) == type_proxy;
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
  return type_of( c ) == type_flow;
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
  return type_of( c ) == type_list;
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
 *  push - push the void on the data stack
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
 *  drops - drops n cells from the data stack
 */

function primitive_drops(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    if( check_de && TOS <= ACTOR_data_stack )break;
    clear( POP() );
  }
}
primitive( "drops", primitive_drops );


/*
 *  dup - duplicates the top of the data stack
 */

function primitive_dup(){
  const tos = TOS;
  copy_cell( tos, PUSH() );
}
primitive( "dup", primitive_dup );


/*
 *  2dup - duplicates the top two cells of the data stack
 */

function primitive_2dup(){
  const tos = TOS;
  copy_cell( tos - ONE, PUSH() );
  copy_cell( tos,       PUSH() );
}
primitive( "2dup", primitive_2dup );


/*
 *  ?dup - duplicates the top of the data stack if it is not zero
 */

function primitive_dup_if(){
  // This is the Forth style of truth, anything non zero
  if( value_of( TOS ) ){
    copy_cell( TOS, PUSH() );
  }
}
primitive( "?dup", primitive_dup_if );


/*
 *  dups - duplicates n cells from the data stack
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
 *  overs - pushes n cells from the data stack
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
 *  2over - pushes the third and fourth cells from TOS
 */

function primitive_2over(){
  const tos = TOS;
  copy_cell( tos - 3 * ONE, PUSH() );
  copy_cell( tos - 2 * ONE, PUSH() );
}
primitive( "2over", primitive_2over );



/*
 *  nip -
 */

function primitive_nip(){
  const old_tos = POP();
  reset_cell_value( TOS );
  move_cell( old_tos, TOS );
}
primitive( "nip", primitive_nip );


/*
 *  tuck - pushes the second cell from the top of the stack
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
 *  swap - swaps the top two cells of the data stack
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
 *  swaps - swaps the top n cells of the data stack
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
 *  2swap - swaps the top four cells of the data stack
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
 *  over - pushes the second cell from the top of the stack
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
 *  rotate - rotates the top three cells of the data stack
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
 *  roll - rotates n cells from the top of the stack
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
 *  pick - pushes the nth cell from the top of the stack
 */

function primitive_pick(){
  const nth = eat_integer( TOS );
  // ToDo: should check that nth is not too big
  copy_cell( TOS - nth * ONE, TOS );
}
primitive( "pick", primitive_pick );


/*
 *  data-depth - pushes the depth of the data stack
 */

const tag_depth = tag( "depth" );

function primitive_data_depth(){
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  set( PUSH(), type_integer, tag_depth, depth );
}
primitive( "data-depth", primitive_data_depth );


/*
 *  clear-data - clears the data stack
 */

function primitive_clear_data(){
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  // ToDo: should take the opportunity to check the stack boundaries?
  legacy_de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    clear( POP() );
  }
}
primitive( "clear-data", primitive_clear_data );


/*
 *  data-dump - dumps the data stack
 */

function primitive_data_dump(){
  let auto_buf = S() + "DATA STACK";
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ++ii ){
    const c = TOS + ii * ONE;
    const i = info_of( c );
    auto_buf += "\n" + N( ii )
    + " " + type_to_text( unpack_type( i ) )
    + " " + tag_to_text(  unpack_name( i ) )
    + " " + cell_to_text( c );
  }
  trace( auto_buf );
}
primitive( "data-dump", primitive_data_dump );


/*
 *  control-depth - pushes the depth of the control stack
 */

function primitive_control_depth(){
  const depth = ( ACTOR_control_stack - CSP ) / ONE;
  // ToDo: should check the stack's boundaries?
  legacy_de&&mand( depth >= 0 );
  set( PUSH(), type_integer, tag_depth, depth );
}
primitive( "control-depth", primitive_control_depth );


/*
 *  clear-control - clears the control stack
 */

const tag_clear_control = tag( "clear-control" );

function primitive_clear_control(){
  // ToDo: should take the opportunity to check the stack boundaries?
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
 *  control-dump - dumps the control stack
 */

function primitive_control_dump(){
  const depth = ( CSP - ACTOR_control_stack ) / ONE;
  let   auto_buf = S() + "Control stack:";
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    const c = CSP - ii * ONE;
    const i = info_of( c );
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
    return N( v );
  }
}*/


/*
 *  text-quote - turns a string into a valid text literal
 */

function HEX( n : Value ) : Text {
// Convert integer to hex string
  // TypeScript version:
  /**/ return n.toString( 16 );
  // C++ version
  /*c{
    // Copilot generated code
    char reversed[ 32 ];
    static char buf[ 32 ];
    // Convert integer to hex string
    for( int ii = 0 ; ii < sizeof( reversed ) ; ii++ ){
      int digit = n & 0xf;
      if( digit < 10 ){
        reversed[ ii ] = (char) ( '0' + digit );
      }else{
        reversed[ ii ] = (char) ( 'a' + digit - 10 );
      }
      n >>= 4;
      if( n == 0 ){
        break;
      }
    }
    // Reverse the string
    int len = strlen( reversed );
    for( int ii = 0 ; ii < len ; ii++ ){
      buf[ ii ] = reversed[ len - ii - 1 ];
    }
    buf[ len ] = 0;
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
  // ToDo: should name the result?
}
primitive( "text-quote", primitive_text_quote );


/*c{

  // C++ version of parseInt( s, base )

  // ToDo: better handling of errors
  static bool parse_int_error = false;

  static int parseInt( const Text& s, int base ){
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
 *  text-to-integer - converts a text literal to an integer
 */

function checked_text_to_integer( txt : TxtC ) : Value {
  // TypeScript version:
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
 *  text-to-integer - converts a text literal into an integer
 *  ToDo: should not FATAL on error
 */


function primitive_text_to_integer(){
  const auto_s = cell_to_text( TOS );
  clear( POP() );
  push_integer( checked_text_to_integer( auto_s ) );
}
primitive( "text-to-integer", primitive_text_to_integer );


/*
 *  text-hex-to-integer - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_text_hex_to_integer( txt : TxtC ) : Value {
  // TypeScript version:
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
 *  text-octal-to-integer - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_text_octal_to_integer( txt : TxtC ) : Value {
  // TypeScript version:
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
 *  text-binary-to-integer - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_text_binary_to_integer( txt : TxtC ) : Value {
  // TypeScript version:
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
 *  integer-to-hex - converts an integer to an hexadecimal text
 */

function primitive_integer_to_hex(){
  const i = pop_integer();
  // TypeScript version:
  /**/ push_text( i.toString( 16 ) );
  // C++ version:
  /*c{
    push_text( HEX( i ) );
  }*/
}
primitive( "integer-to-hex", primitive_integer_to_hex );


/*
 *  integer-to-octal - convert an integer to an octal text
 */

function primitive_integer_to_octal(){
  const i = pop_integer();
  // TypeScript version:
  /**/ push_text( i.toString( 8 ) );
  // C++ version:
  /*c{
    char reversed[ 48 ];
    static char buf[ 48 ];
    // Convert to octal
    int ii = 0;
    while( i > 0 ){
      reversed[ ii++ ] = '0' + ( i & 0x7 );
      i >>= 3;
    }
    // Reverse
    for( int jj = 0 ; jj < ii ; jj++ ){
      buf[ jj ] = reversed[ ii - jj - 1 ];
    }
    buf[ ii ] = '\0';
    push_text( buf );
  }*/
}
primitive( "integer-to-octal", primitive_integer_to_octal );


/*
 *  integer-to-binary - converts an integer to a binary text
 */

function primitive_integer_to_binary(){
  const i = pop_integer();
  // TypeScript version:
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
 *  text-unquote - turns a JSON text into a text
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

function proxy_is_safe( proxy : Cell ) : boolean {
  /**/ return all_proxied_objects_by_id.has( proxy )
  //c/ return area_is_safe( proxy );
}


function reference_is_safe( a : Cell ) : boolean {
  if( !area_is_safe( a ) )return false;
  return true;
}


function cell_looks_safe( c : Cell ) : boolean {
// Try to determine if a cell looks like a valid one

  const v = value_of( c );
  const i = info_of( c );
  const t = unpack_type( i );

  let referencee = v;
  let tag = v;

  // ToDo: reorder the checks to be more efficient
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
    if( !lean_is_valid( referencee ) ){
      bug( S()
        + "Invalid lean string for text cell, " + C( referencee )
        + " at " + C( c )
      );
      debugger;
      lean_is_valid( referencee );
      return false;
    }
    // ToDo: check it is a text
    return true;

  case type_proxy :
    return proxy_is_safe( referencee );

  case type_reference :
    return reference_is_safe( referencee );

  case type_tag :
    if( ! tag_is_valid( tag ) ){
      bug( S()
        + "Invalid tag for cell, " + C( tag )
        + " at " + C( c )
      );
      return false;
    }
    return true;

  case type_integer :
    return true;

  case type_float :
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

  const v = value_of( c );
  const i = info_of(  c );
  const t = unpack_type( i );

  // ToDo: optimize with a switch?
  if( t == type_text ){
    //c/ return LeanString( v );
    /**/ return lean_to_native( v );
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
  return ( value_of( c ) == c || c == 0 );
}


// The header of each block of machine codes.
// ToDo: create a "definition" type?
const tag_block = tag( "block" );


function cell_is_a_block( c : Cell ) : boolean {
  return name_of( c ) == tag_block_header;
}


function is_a_verb_block( c : Cell ) : boolean {
// True when block is the definition of a verb vs inline code.
  return cell_is_a_block( c ) && !is_an_inline_block_cell( c );
}


function block_dump( ip : Cell ) : Text {
  de&&mand( cell_is_a_block( ip ) );
  const length = block_length( ip );
  let auto_buf = S();
  auto_buf += "Block " + C( ip ) + ", length " + N( length );
  // ToD: decode flags
  if( is_an_inline_block_cell( ip ) ){
    auto_buf += ", inline {}";
  }else{
    auto_buf += ", verb definition";
    if( is_immediate_verb( name_of( ip ) ) ){
      auto_buf += ", immediate";
    }
  }
  return auto_buf;
}


let cell_dump_entered = false;

function tag_to_dump_text( tag : Value ) : Text {
  return tag_to_text( tag );
  if( tag == 0 ){
    return "invalid-0-tag";
  }else if( !tag_is_valid( tag ) ){
    return "invalid-tag-" + N( tag );
  }else{
    return tag_to_text( tag );
  }
}


function dump( c : Cell ) : Text {
// Return a text representation that is usefull for debugging

  // Never dereference the cell at address 0, at least in C++
  /*c{
    if( c == 0 ){
      return "Invalid cell address 0";
    }
  }*/

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

  let v = value_of( c );
  let i = info_of(  c );
  let t = unpack_type( i );
  let n = unpack_name( i );

  let class_name_tag = 0;

  /**/ let  buf = "";
  //c/ Text buf(  "" );
  /**/ let  txt = "";
  //c/ Text txt(  "" );

  switch( t ){

    case type_void :

      if( n == tag_block ){
        // Block description often comes next
        // ToDo: check presence of block header
        if( cell_is_a_block( c + ONE ) ){
          cell_dump_entered = false;
          return S()+ "block definition";
        }
      }

      if( n != tag_void || v != 0 ){
        if( tag_is_valid( n ) ){
          buf += tag_to_text( n ) + " ( primitive )";
        }else{
          dump_invalid_cell = c;
          buf += "Invalid-tag-" + N( n );
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

      if( n == tag_dynamic_ref_count ){
        // Check integrity of busy dynamic area
        if( !area_is_safe( header_to_area( c ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid busy dynamic area, ";
        }else{
          cell_dump_entered = false;
          return "busy, count: " + N( v );
        }

      }else if( n == tag_dynamic_next_area ){
        // Check integrity of free dynamic area
        if( !area_is_safe( header_to_area( c ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid dynamic free area, ";
        }else{
          cell_dump_entered = false;
          return "free, next: " + C( v );
        }

      }else if( n == tag_dynamic_area_size ){
        // Check integrity of dynamic area
        if( !area_is_safe( header_to_area( c - ONE ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          if( area_is_busy( header_to_area( c - ONE ) )){
            let length = to_cell( v ) - 2;
            // 0 length is what proxied objects use in TypeScript
            // 1 length is what proxied objects use in C++
            if(
              /**/ length == 0
              //c/ length == 1 && name_of( c + ONE ) == tag_c_string
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

      }else if( n == tag_block_header ){
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
      class_name_tag = name_of( v );
      buf += tag_to_dump_text( n )
      + "<" + tag_to_dump_text( class_name_tag ) + C( v ) + ">";
    break;

    case type_proxy :
      /**/ const obj = proxied_object_by_id( v );
      /**/ const proxy_class_name = obj.constructor.name;
      // ToDo: in C++, the instance of AbstractProxy should give the class name
      /**/ //c/ TxtC proxy_class_name( "invalid-proxy" );
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
        buf += " ( <SINGLETON> )";
      }else if( tlen( txt ) == 0 && v != 0 ){
        buf += " ( <INVALID_EMPTY_TEXT> )";
      }
    break;

    case type_verb :
      // ToDo: add name
      buf += tag_to_dump_text( n );
      if( v != 0 ){
        buf += ":<verb:" + N( v ) + ">";
      }else{
        buf += " ( verb )";
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

  let v = value_of( c );
  let i = info_of(  c );
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
      class_name_tag = name_of( v );
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
  if( value_of( ptr + 2 * ONE ) != 0 ){
    buf += "\n-2 DIRTY -> " + dump( ptr + 2 * ONE );
    some_dirty = true;
  }
  if( value_of( ptr + ONE ) != 0 ){
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

  if( value_of( ptr + 2 * ONE ) != 0 ){
    buf += "\n-2 DIRTY -> " + dump( ptr + 2 * ONE );    some_dirty = true;
  }
  if( value_of( ptr + 1 * ONE ) != 0 ){
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

  if( verbose_stack_de && some_dirty ){
    bug( buf );
    debugger;
  }

  return buf;

}


/*
 *  debugger - invoke host debugger, if any
 */

function primitive_debugger(){
  debugger;
}
primitive( "debugger", primitive_debugger );


/*
 *  debug - activate lots of traces
 */

function primitive_debug(){
  debug();
}
primitive( "debug", primitive_debug );


/*
 *  normal-debug - deactivate lots of traces, keep type checking
 */

function primitive_normal_debug(){
  normal_debug();
  init_debug_level( INOX_DEBUG_LEVEL );
}
primitive( "normal-debug", primitive_normal_debug );


/*
 *  log - enable/disable traces and checks
 */

function primitive_log(){

  const verb_cell = POP();
  const typ = type_of( verb_cell );

  if( typ == type_tag ){

    const verb = value_of( verb_cell );

    if( verb == tag( "do-not" ) ){
      can_log = false;
    }

    if( verb == tag( "do" ) ){
      can_log = true;
    }

    /**/ bug = can_log ? console.log : trace;

    if( verb == tag( "enable" ) ){
      const domain_cell = POP();
      const domain_id = value_of( domain_cell );
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
      if( domain_id == tag( "verbose-stack" ) ){
        /**/ verbose_stack_de = true;
        /*c{
          #ifndef verbose_stack_de
            verbose_stack_de = true;
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
      const domain_id = value_of( domain_cell );
      if( domain_id == tag( "eval" ) ){
        /**/ eval_de = false;
        /*c{
          #ifndef eval_de
            eval_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "step" ) ){
        /**/ step_de = false;
        /*c{
          #ifndef step_de
            step_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "run" ) ){
        /**/ run_de = false;
        /*c{
          #ifndef run_de
            run_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "stack" ) ){
        /**/ stack_de = false;
        /*c{
          #ifndef stack_de
            stack_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "verbose-stack" ) ){
        /**/ verbose_stack_de = false;
        /*c{
          #ifndef verbose_stack_de
            verbose_stack_de = false;
          #endif
        }*/
      }
      if( domain_id == tag( "token" ) ){
        /**/ token_de = false;
        /*c{
          #ifndef token_de
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
 *  fast! - Switch to "fast mode", return previous state
 */

const tag_is_fast = tag( "fast?" );

function primitive_set_fast(){
  // ToDo: per actor?
  check_de&&mand_boolean( TOS );
  const was_turbo = de;
  if( value_of( TOS ) ){
    no_debug_at_all();
  }else{
    normal_debug();
  }
  set_value( TOS, was_turbo ? 1 : 0 );
  set_tos_name( tag_is_fast );
}
primitive( "fast!", primitive_set_fast );


/*
 *  fast? - Return current state for "fast mode"
 */

function primitive_is_fast(){
  push_boolean( de || check_de ? false : true );
  set_tos_name( tag_is_fast );
}
primitive( "fast?", primitive_is_fast );


/*
 *  noop - No operation - does nothing
 */

function save_ip( label : Tag ){
  CSP += ONE;
  set( CSP, type_ip, label, IP );
}

function primitive_noop(){
}
primitive( "noop", primitive_noop );


/*
 *  assert-checker - internal
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
  IP = eat_ip( CSP );
  CSP -= ONE;

}
primitive( "assert-checker", primitive_assert_checker );


const tag_assert_checker = tag( "assert-checker" );

// Cannot init now in C++, see init_globals();
let assert_checker_definition = 0;
// = definition_of( tag_assert_checker );


/*
 *  assert - assert a condition, based on the result of a block
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
  set( CSP, type_ip, tag_assert_checker, assert_checker_definition );

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

/*
 *  type-of - Get type of the TOS value, as a tag
 */

function primitive_type_of(){
  const tag = type_to_tag( type_of( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_type, tag );
}
primitive( "type-of", primitive_type_of );


/*
 *  name-of - Get the name of the TOS value, a tag
 */

function primitive_name_of(){
  const n = name_of( TOS );
  clear( TOS );
  set( TOS, type_tag, tag_name, n );
}
primitive( "name-of", primitive_name_of );


/*
 *  value-of - Get the raw integer value of the TOS value
 */

function primitive_value_of(){
  let v = value_of( TOS );
  clear( TOS );
  set( TOS, type_integer, tag_value, v );
}
primitive( "value-of", primitive_value_of );


/*
 *  info-of - Get the packed type and name of the TOS value
 */

function primitive_info_of(){
  let i = info_of( TOS );
  clear( TOS );
  set(   TOS, type_integer, tag_info, i );
}
primitive( "info-of", primitive_info_of );


/*
 *  pack-info - Pack type and name into an integer
*/

function primitive_pack_info(){
  const name_cell = POP();
  const type_cell = TOS;
  const type_id = tag_to_type( value_of( type_cell ) );
  de&&mand( type_id != type_invalid );
  const info = pack( type_tag, value_of( name_cell ) );
  clear( type_cell );
  clear( name_cell );
  init_cell(  TOS, info, pack( type_integer, tag_info ) );
}
primitive( "pack-info", primitive_pack_info );


/*
 *  unpack-type - Unpack type from an integer, see pack-info
 */

function primitive_unpack_type(){
  const info    = value_of( TOS );
  const typ     = unpack_type( info );
  /**/ const typ_tag = type_to_tag( typ );
  //c/ Tag   typ_tag = type_to_tag( (Type) typ );
  clear( TOS );
  init_cell( TOS, typ_tag, pack( type_tag, tag_type ) );
}
primitive( "unpack-type", primitive_unpack_type );


/*
 *  unpack-name - Unpack name from an integer, see pack-info
*/

function primitive_unpack_name(){
  const info = value_of( TOS );
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


function type_to_tag( type_id : Type ) : Tag {
// Convert a type id, 0..15, into it's tag.
  if( type_id < 0 || type_id >= type_invalid )return tag_invalid;
  if( type_id == type_void )return tag_void;
  return type_id;
}


function tag_to_type( tag : Tag ) : Type {
// Convert a tag into a type id
  /*ts{*/
    if( tag == tag_void    )return 0;
    if( tag < type_invalid )return tag;
  /*}*/
  /*c{
    if( (u32) tag < type_invalid )return (Type) tag;
  }*/
  return type_invalid;
}


function type_name_to_type( n : ConstText ) : Type {
// Convert a type text name into a type id
  // ToDo should return a tag?
  const idx = symbol_lookup( n );
  if( idx > type_invalid )return type_invalid;
  /**/ return idx;
  //c/ return (Type) idx;
}


function cell_class_tag( c : Cell ) : Tag {
// Get the most specific type of a cell's value
  const t = type_of( c );
  // For references, it's the name stored in the first cell of the object
  if( t == type_reference ){
    return name_of( value_of( c ) );
  }
  // For proxied object, it's the class name of the proxied object
  if( t == type_proxy ){
    //c/ return tag_c_string;
    /**/ const proxied_obj = proxied_object_by_id( value_of( c ) );
    /**/ const js_type = typeof proxied_obj;
    /**/ if( typeof proxied_obj == "object" ){
    /**/   return tag( proxied_obj.constructor.name );
    /**/ }
    /**/ return tag( js_type );
  }
  return type_to_tag( type_of( c ) );
}

/*
 *  class-of - Get the most specific type name (as a tag)
 */

const tag_class = tag( "class" );

function primitive_inox_class_of(){
  const class_tag = cell_class_tag( TOS );
  clear( TOS );
  set( TOS, type_tag, tag_class, class_tag );
}
primitive( "class-of", primitive_inox_class_of );


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
  de&&mand_eq( name_of( IP ), tag_while_2 );
  // Save info for break-loop, it would skip to after while-3
  CSP += ONE;
  set( CSP, type_ip, tag_break_sentinel, IP + 2 * ONE );
  // Remember body and condition in control stack
  CSP += ONE;
  set( CSP, type_ip, tag_while_body, body_block );
  CSP += ONE;
  set( CSP, type_ip, tag_while_condition, condition_block );
  // The control stack now holds:
  //   IP for break, named loop-sentinel
  //   IP for the body block
  //   IP for the condition block
  // Execution continues inside while-2
}
primitive( "while-1", primitive_while_1 );


function primitive_while_2(){
  // IP is expected to point to while-3
  de&&mand_eq( name_of( IP ), tag_while_3 );
  const condition_block = value_of( CSP );
  // Invoke condition, like run would do
  CSP += ONE;
  set( CSP, type_ip, tag_goto_while_3, IP );
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
    const body_block = value_of( CSP - ONE );
    // The return of the body block must jump to while-2
    CSP += ONE;
    // ip currently points after this primitive, hence while-2 is before
    set( CSP, type_ip, tag_goto_while_2, IP - 2 * ONE );
    // CSP must now point to while-2 primitive verb
    de&&mand_eq( name_of( value_of( CSP ) ), tag_while_2 );
    // Jump into the body block
    IP = body_block;

  // The while condition is not met, it's time to exit the loop
  }else{
    // Drop break sentinel, condition and body from control stack
    // ToDo: use lookup instead of fixed value if optimistic guess failed.
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    de&&mand_eq( name_of( CSP - 2 * ONE ), tag_break_sentinel );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
  }
}
primitive( "while-3", primitive_while_3 );


function primitive_until_3(){
// Like while loop but with the boolean reversed
  if( value_of( TOS ) == 0 ){
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
  set( CSP, type_ip, tag_break_sentinel, IP );
  // Invoke body block, it will return to itself, loopimg until some break
  CSP += ONE;
  set( CSP, type_ip, tag_break_sentinel, body_block );
  // Jump into boby block
  IP = body_block;
}
primitive( "loop", primitive_loop );


function lookup_sentinel( csp : Cell, tag : Tag ) : Cell {
  let next_csp = csp - ONE;
  // Drop anything until sentinel
  while( next_csp >= ACTOR_control_stack ){
    // ToDo: test type against Act boundary
    if( name_of( next_csp ) == tag )return next_csp;
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
  IP = value_of( sentinel_csp );
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
  set( CSP, type_ip, sentinel_name, IP );
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
  IP = eat_ip( CSP );
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
// = definition_of( tag_until_checker );


function primitive_until_checker(){
  const flag = pop_boolean();
  if( flag == 0 ){
    const body_block = value_of( CSP );
    CSP -= ONE;
    const condition_block = value_of( CSP );
    CSP += ONE;
    set( CSP, type_ip, tag_loop_until, until_checker_definition );
    CSP += ONE;
    set( CSP, type_ip, tag_loop_condition, condition_block );
    IP = body_block;
  }else{
    // Drop loop sentinel, condition and body from control stack
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
    IP = value_of( CSP );
    CSP -= ONE;
  }
}
primitive( "until-checker", primitive_until_checker );


const tag_while_checker   = tag( "while-checker" );

// C++ cannot get definitions now, see init_globals()
let while_checker_definition = 0;
// = definition_of( tag_while_checker );


function primitive_while_checker(){
  const flag = pop_boolean();
  if( flag == 0 ){
    const body_block = value_of( CSP );
    CSP -= ONE;
    const condition_block = value_of( CSP );
    CSP += ONE;
    set( CSP, type_ip, tag_loop_until, while_checker_definition );
    CSP += ONE;
    set( CSP, type_ip, tag_loop_condition, condition_block );
    IP = body_block;
  }else{
    // Drop loop sentinel, condition and body from control stack
    reset( CSP - 0 * ONE );
    reset( CSP - 1 * ONE );
    reset( CSP - 2 * ONE );
    CSP -= 3 * ONE;
    IP = value_of( CSP );
    CSP -= ONE;
  }
}
primitive( "while-checker", primitive_while_checker );


function primitive_loop_until(){
  debug();
  const condition_block = pop_block();
  const body_block      = pop_block();
  CSP += ONE;
  set( CSP, type_ip, tag_break_sentinel, IP );
  CSP += ONE;
  set( CSP, type_ip, tag_loop_condition, condition_block );
  CSP += ONE;
  set( CSP, type_ip, tag_loop_body, body_block );
  CSP += ONE;
  set( CSP, type_ip, tag_until_checker, until_checker_definition );
  CSP += ONE;
  set( CSP, type_ip, tag_loop_condition, condition_block );
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
  set( CSP, type_ip, tag_break_sentinel, IP );
  CSP += ONE;
  set( CSP, type_ip, tag_loop_condition, condition_block );
  CSP += ONE;
  set( CSP, type_ip, tag_loop_body, body_block );
  CSP += ONE;
  set( CSP, type_ip, tag_until_checker, while_checker_definition );
  CSP += ONE;
  set( CSP, type_ip, tag_loop_condition, condition_block );
  IP = body_block;
}
primitive( "loop-while", primitive_loop_while );


/* -----------------------------------------------------------------------------
 *  Polymorphic methods.
 */

const tag_missing_method   = tag( "missing-method"   );
const tag_missing_verb     = tag( "missing-verb"     );
const tag_missing_operator = tag( "missing-operator" );

/*ts{*/

function dispatch_binary_operator(
  operator_tag : Index,
  target_type  : Index
) : void {

  const tos = TOS;
  const target = tos + ONE;

  const target_class_name = !is_a_reference_type( target_type )
  ? type_to_text( target_type )
  : tag_to_text( name_of( target ) );

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
  set( CSP, type_ip, verb_id, IP );
  IP = definition_of( verb_id );

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
    set( CSP, type_ip, verb_id, IP );
    IP = definition_of( verb_id );
  }

}


function define_overloaded_binary_operator_primitives(
  n : ConstText,
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

  const target_type = type_of( TOS - ONE );

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
  const value1 = value_of( p1 );
  const value2 = value_of( p2 );
  const type1  = type_of(  p1 );
  const type2  = type_of(  p2 );

  // Simple case if when both type and value are the same
  if( type1 == type2 ){
    if( value1 == value2 ){
      clear( p2 );
      clear( p1 );
      set( p1, type_boolean, tag_is_equal, 1 );
      return;
    }
    // If not references, then they're necesseraly different
    if( !is_sharable( p1 ) ){
      clear( p2 );
      clear( p1 );
      set( p1, type_boolean, tag_is_equal, 0 );
      return;
    }
    // For text, compare content
    if( type1 == type_text  ){
      /**/ const text1 = cell_proxied_object( p1 );
      /**/ const text2 = cell_proxied_object( p2 );
      //c/ const char* text1 = (const char*) value_of( value_of( p1 ) );
      //c/ const char* text2 = (const char*) value_of( value_of( p2 ) );
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
  set_value( TOS, value_of( TOS ) == 0 ? 1 : 0 );
}
operator_primitive( "<>", primitive_is_not_equal );


/*
 *  ==? - object identicallity, ie shallow equality, not deep equality.
 */

function primitive_is_identical(){

  const p2     = POP();
  const p1     = TOS;
  const value1 = value_of( p1 );
  const value2 = value_of( p2 );
  const type1  = type_of(  p1 );
  const type2  = type_of(  p2 );

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
  set_value( TOS, value_of( TOS ) == 0 ? 1 : 0 );
}
operator_primitive( "not==?", primitive_is_not_identical );


/*
 *  Generic solution for arithmetic operators
 */

/**/ function binary_math_operator( n : ConstText, fun : Function ) : void {
/**/ // Build an operator primitive. ToDo: Also built integer.xx, float.xx
/**/   operator_primitive(
/**/      n,
/**/      function primitive_binary_operator(){
/**/        const p2 = POP();
/**/        const p1 = TOS;
/**/        if( check_de ){
/**/          if( type_of( p2 ) != type_integer ){
/**/            clear( p2 );
/**/            bug( "bad type, expecting integer second operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/          if( type_of( p1 ) != type_integer ){
/**/            bug( "bad type, expecting integer first operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/        }
/**/        const r = fun( value_of( p1 ), eat_raw_value( p2 ) );
/**/        set_value( p1, r );
/**/      }
/**/    );
/**/  }


/**/  function binary_boolean_operator( n : ConstText, fun : Function ) : void {
/**/  // Build an boolean operator primitive. Also built boolean.
/**/    operator_primitive(
/**/      n,
/**/      function primitive_binary_boolean_operator(){
/**/        const p2 = POP();
/**/        const p1 = TOS;
/**/        if( check_de ){
/**/          if( type_of( p2 ) != type_boolean ){
/**/            clear( p2 );
/**/            bug( "bad type, expecting boolean second operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/          if( type_of( p1 ) != type_boolean ){
/**/            bug( "bad type, expecting boolean first operand" );
/**/            assert( false );
/**/            return;
/**/          }
/**/        }
/**/        const r = fun( value_of( p1 ), eat_raw_value( p2 ) );
/**/        set_value( p1, r );
/**/      }
/**/    );
/**/  }


/*
 *  Generic solution for arithmetic operators
 */

/*ts{*/

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

/*}*/

/*c{

static void check_int_parameters( int* a, int* b ){
  const p2 = POP();
  const p1 = TOS;
  if( check_de ){
    if( type_of( p2 ) != type_integer ){
      bug( "bad type, expecting integer second operand" );
      assert( false );
      return;
    }
    if( type_of( p1 ) != type_integer ){
      bug( "bad type, expecting integer first operand" );
      assert( false );
      return;
    }
  }
  *a = value_of( p1 );
  *b = eat_raw_value( p2 );
}

static void checked_int_minus( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a - b );
}

static void checked_int_multiply( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a * b );
}

static void checked_int_divide( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a / b );
}

static void checked_int_modulo( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a % b );
}

void checked_int_power( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, (Value) pow( a, b ) );
}

static void checked_int_left_shift( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a << b );
}

static void checked_int_right_shift( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a >> b );
}

static void checked_int_and( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a & b );
}

static void checked_int_or( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a | b );
}

static void checked_int_xor( void ){
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

/*ts{*/

function unary_math_operator( n : ConstText, fun : Function ) : void {
  operator_primitive( n, function primitive_unary_operator(){
    const p0 = TOS;
    const r  = fun( value_of( p0 ) );
    de&&mand( r == 0 || r == 1 );
    set_value( p0, r );
    set_type( p0, type_integer )
  } );
 }


/**/ function unary_boolean_operator( n : ConstText, fun : Function ) : void {
/**/   operator_primitive( n, function primitive_unary_boolean_operator(){
/**/     const p0 = TOS;
/**/     const r  = fun( value_of( p0 ) );
/**/     de&&mand( r == 0 || r == 1 );
/**/     set_value( p0, r );
/**/     set_type( p0, type_boolean );
/**/   } );
/**/ }


 /*}*/


/*
 *  ? operator
 */

const tag_is_truth = tag( "truth?" );

function primitive_is_truth(){

  const typ = type_of( TOS );

  switch( typ ){

    case type_void:
      de&&mand_eq( value_of( TOS ), 0 );
    break;

    case type_boolean:
      de&&mand( value_of( TOS ) == 0 || value_of( TOS ) == 1 );
    break;

    case type_integer:
      if( value_of( TOS ) != 0 ){
        set_value( TOS, 1 );
      }else{
        // not needed: set_value( TOS, 0 );
      }
    break;

    case type_reference:
      if( value_of( TOS ) != 0 ){
        clear( TOS );
        set_value(  TOS, 1 );
      }
    break;

    case type_proxy:
      clear( TOS );
    break;

    case type_text:
      if( value_of( TOS ) != 0 ){
        let is_empty;
        /**/ proxied_object_by_id( value_of( TOS ) ).length == 0;
        //c/ is_empty = *(char*) value_of( TOS ) == 0;
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
  set_tos_name( tag_is_truth );
}
primitive( "truth?", primitive_is_truth );

operator_primitive( "?", primitive_is_truth );


/*
 *  something? operator
 */

const tag_is_something = tag( "something?" );

function primitive_is_someting(){
  const typ = type_of( TOS );
  if( typ == type_void ){
    if( value_of( TOS ) != 0 ){
      set( TOS, type_boolean, tag_is_something, 1 );
    }else{
      set( TOS, type_boolean, tag_is_something, 0 );
    }
    return;
  }
  clear( TOS );
  set( TOS, type_boolean, tag_is_something, 1 );
}
primitive( "something?", primitive_is_someting );

operator_primitive( "something?", primitive_is_someting );


/*
 *  void? operator - true when TOS is of type void and value is 0.
 *  Note: the name of the value does not matter.
 */

function primitive_is_void(){
  // ToDo: should also check the name?
  const typ = type_of( TOS );
  if( typ == type_void ){
    set_type(  TOS, type_boolean );
    if( value_of( TOS ) == 0 ){
      set_value( TOS, 1 );
    }else{
      set_value( TOS, 0 );
    }
    return;
  }
  clear_value( TOS );
  set_type( TOS, type_boolean );
}
primitive( "void?", primitive_is_void );

operator_primitive( "void?", primitive_is_void );



/*
 *  true? operator
 */

function primitive_is_true(){
  const typ = type_of( TOS );
  if( typ == type_boolean ){
    if( value_of( TOS ) != 1 ){
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

const tag_is_false = tag( "false?" );

function primitive_is_false(){
  const typ = type_of( TOS );
  if( typ == type_boolean ){
    if( value_of( TOS ) != 0 ){
      set( TOS, type_boolean, tag_is_false, 0 );
    }else{
      set( TOS, type_boolean, tag_is_false, 1 );
    }
    return;
  }
  clear( TOS );
  set( TOS, type_boolean, tag_is_false, 0 );
}
primitive( "false?", primitive_is_false );

operator_primitive( "false?",  primitive_is_false  );


/*
 *  not unary boolean operator
 */

function  primitive_not(){
  check_de&&mand_boolean( TOS );
  if( value_of( TOS ) == 0 ){
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
  if( value_of( TOS ) == 0 ){
    set_value( TOS, p2 );
    set_name(  TOS, name_of( p2 ) );
  }
}
operator_primitive( "or", primitive_or );


/*
 *  and binary boolean operator
 */

function primitive_and(){
  const p2 = pop_boolean();
  check_de&&mand_boolean( TOS );
  if( value_of( TOS ) != 0 ){
    set_value( TOS, p2 );
    set_name(  TOS, name_of( p2 ) );
  }
}
operator_primitive( "and", primitive_and );


/*
 *  xor binary boolean operator
 */

function  primitive_xor(){
  const p2 = pop_boolean();
  check_de&&mand_boolean( TOS );
  if( value_of( TOS ) != 0 ){
    if( value_of( p2 ) != 0 ){
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

/*ts{*/

binary_boolean_operator(  ">",    ( a, b ) => ( a >   b ) ? 1 : 0 );
binary_boolean_operator(  "<",    ( a, b ) => ( a <   b ) ? 1 : 0 );
binary_boolean_operator(  ">=",   ( a, b ) => ( a >=  b ) ? 1 : 0 );
binary_boolean_operator(  "<=",   ( a, b ) => ( a <=  b ) ? 1 : 0 );

unary_boolean_operator(   "=1?",   ( x )    => ( x ==  1 ) ? 1 : 0 );
unary_boolean_operator(   "=-1?",  ( x )    => ( x == -1 ) ? 1 : 0 );
unary_boolean_operator(   "=0?",   ( x )    => ( x ==  0 ) ? 1 : 0 );
unary_boolean_operator(   "<>0?",  ( x )    => ( x !=  0 ) ? 1 : 0 );
unary_boolean_operator(   "<0?",   ( x )    => ( x  <  0 ) ? 1 : 0 );
unary_boolean_operator(   "<=0?",  ( x )    => ( x <=  0 ) ? 1 : 0 );
unary_boolean_operator(   ">0?",   ( x )    => ( x  >  0 ) ? 1 : 0 );
unary_boolean_operator(   ">=0?",  ( x )    => ( x >=  0 ) ? 1 : 0 );

/*}*/

/*c{

static void checked_int_is_greater_than(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a > b );
}

static void checked_int_is_less_than(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a < b );
}

static void checked_int_is_greater_or_equal(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a >= b );
}

static void checked_int_is_less_or_equal(){
  int a, b;
  check_int_parameters( &a, &b );
  push_boolean( a <= b );
}


operator_primitive(  ">",   checked_int_is_greater_than );
operator_primitive(  "<",   checked_int_is_less_than );
operator_primitive(  ">=",  checked_int_is_greater_or_equal );
operator_primitive(  "<=",  checked_int_is_less_or_equal );

static void checked_int_is_equal_to_1(){
  const x = pop_integer();
  push_boolean( x == 1 );
}

static void checked_int_is_equal_to_minus_1(){
  const x = pop_integer();
  push_boolean( x == -1 );
}

static void checked_int_is_equal_to_0(){
  const x = pop_integer();
  push_boolean( x == 0 );
}

static void checked_int_is_not_equal_to_0(){
  const x = pop_integer();
  push_boolean( x != 0 );
}

static void checked_int_is_less_than_0(){
  const x = pop_integer();
  push_boolean( x < 0 );
}

static void checked_int_is_less_or_equal_to_0(){
  const x = pop_integer();
  push_boolean( x <= 0 );
}

static void checked_int_is_greater_than_0(){
  const x = pop_integer();
  push_boolean( x > 0 );
}

static void checked_int_is_greater_or_equal_to_0(){
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

/*ts{*/

unary_math_operator( "NOT",      ( x ) => ~x                );
unary_math_operator( "negative", ( x ) => -x                );
unary_math_operator( "sign",     ( x ) => x < 0   ? -1 :  1 );
unary_math_operator( "abs",      ( x ) => x > 0   ?  x : -x );

/*}*/

/*c{

static void checked_int_not(){
  const x = pop_integer();
  push_integer( ~x );
}

static void checked_int_negative(){
  const x = pop_integer();
  push_integer( -x );
}

static void checked_int_sign(){
  const x = pop_integer();
  push_integer( x < 0 ? -1 : 1 );
}

static void checked_int_abs(){
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
 *  is-a-float? - check if a value is a float
 */

function primitive_is_a_float(){
  const tos = POP();
  push_boolean( is_a_float_cell( tos ) );
}
primitive( "is-a-float?", primitive_is_a_float );


/*
 *  to-float - convert something into a float
 */

function push_float( f : Float ){
  const c = PUSH();
  // TypeScript version:
  /**/ mem32f[ c ] = f;
  // C++ version:
  //c/ *( float* ) ( ( void* ) ( c << 4 ) ) = f;
  set_type( c, type_float );
  set_name( c, tag_float );
}

/*
 *  to-float - convert something into a float
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
 *  float-to-integer - convert a float to an integer
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
 *  float-to-text - convert a float to a text
 */

function primitive_float_to_text(){
  const auto_f = pop_float();
  /**/ const buf = auto_f.toString();
  /*c{
    // This is a OpenAI generated solution, march 18 2023
    // ToDo: test it
    char buf[32];  // buffer for result

    // handle special cases: NaN, infinity, zero
    if ( isnan(auto_f)) {
      memcpy(buf, "nan", 4 );
    } else if ( isinf(auto_f)) {
      if (auto_f > 0) {
        memcpy(buf, "inf", 4 );
      } else {
        memcpy(buf, "-inf", 5);
      }
    } else if (auto_f == 0) {
      memcpy(buf, "0.0", 4 );
    } else {
      // handle sign
      if (auto_f < 0) {
        buf[0] = '-';
        auto_f = -auto_f;
      } else {
        buf[0] = '\0';
      }

      // handle integer part
      int intPart = (int)auto_f;
      if (intPart == 0) {
        strcat(buf, "0");
      } else {
        char intBuf[16];
        int idx = 0;
        while (intPart > 0) {
          intBuf[idx++] = '0' + (intPart % 10);
          intPart /= 10;
        }
        intBuf[idx] = '\0';
        for (int i = 0; i < idx / 2; i++) {
          char tmp = intBuf[i];
          intBuf[i] = intBuf[idx - 1 - i];
          intBuf[idx - 1 - i] = tmp;
        }
        strcat(buf, intBuf);
      }

      // handle fractional part
      float fracPart = auto_f - (float)intPart;
      if (fracPart != 0) {
        strcat(buf, ".");
        char fracBuf[16];
        int i = 0;
        while (i < 6 && fracPart != 0) {
          fracPart *= 10;
          int digit = (int)fracPart;
          fracBuf[i++] = (char) ( '0' + digit );
          fracPart -= (float)digit;
        }
        fracBuf[i] = '\0';
        strcat(buf, fracBuf);
      }
    }
  }*/
  push_text( buf );
}


/*
 *  float-add - add two floats
 */

function primitive_float_add(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 + auto_f2 );
}
primitive( "float-add", primitive_float_add );


/*
 *  float-subtract - subtract two floats
 */

function primitive_float_subtract(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 - auto_f2 );
}
primitive( "float-subtract", primitive_float_subtract );


/*
 *  float-multiply - multiply two floats
 */

function primitive_float_multiply(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 * auto_f2 );
}
primitive( "float-multiply", primitive_float_multiply );


/*
 *  float-divide - divide two floats
 */

function primitive_float_divide(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 / auto_f2 );
}
primitive( "float-divide", primitive_float_divide );


/*
 *  float-remainder - remainder of two floats
 */

function primitive_float_remainder(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  /**/ const auto_f = auto_f1 % auto_f2;
  //c/ auto  auto_f = fmod( auto_f1, auto_f2 );
  push_float( auto_f );
}
primitive( "float-remainder", primitive_float_remainder );


/*
 *  float-power - power of two floats
 */

function primitive_float_power(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.pow( auto_f1, auto_f2 );
  //c/ auto  auto_f = pow( auto_f1, auto_f2 );
  push_float( auto_f );
}


/*
 *  float-sqrt - square root of a float
 */

function primitive_float_sqrt(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.sqrt( auto_f1 );
  //c/ auto  auto_f = sqrt( auto_f1 );
  push_float( auto_f );
}
primitive( "float-sqrt", primitive_float_sqrt );


/*
 *  float-sin - sine of a float
 */

function primitive_float_sin(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.sin( auto_f1 );
  //c/ auto  auto_f = sin( auto_f1 );
  push_float( auto_f );
}
primitive( "float-sin", primitive_float_sin );


/*
 *  float-cos - cosine of a float
 */

function primitive_float_cos(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.cos( auto_f1 );
  //c/ auto  auto_f = cos( auto_f1 );
  push_float( auto_f );
}
primitive( "float-cos", primitive_float_cos );


/*
 *  float-tan - tangent of a float
 */

function primitive_float_tan(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.tan( auto_f1 );
  //c/ auto  auto_f = tan( auto_f1 );
  push_float( auto_f );
}
primitive( "float-tan", primitive_float_tan );


/*
 *  float-asin - arc sine of a float
 */

function primitive_float_asin(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.asin( auto_f1 );
  //c/ auto  auto_f = asin( auto_f1 );
  push_float( auto_f );
}
primitive( "float-asin", primitive_float_asin );


/*
 *  float-acos - arc cosine of a float
 */

function primitive_float_acos(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.acos( auto_f1 );
  //c/ auto  auto_f = acos( auto_f1 );
  push_float( auto_f );
}
primitive( "float-acos", primitive_float_acos );


/*
 *  float-atan - arc tangent of a float
 */

function primitive_float_atan(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.atan( auto_f1 );
  //c/ auto  auto_f = atan( auto_f1 );
  push_float( auto_f );
}
primitive( "float-atan", primitive_float_atan );


/*
 *  float-log - natural logarithm of a float
 */

function primitive_float_log(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.log( auto_f1 );
  //c/ auto  auto_f = log( auto_f1 );
  push_float( auto_f );
}
primitive( "float-log", primitive_float_log );


/*
 *  float-exp - exponential of a float
 */

function primitive_float_exp(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.exp( auto_f1 );
  //c/ auto  auto_f = exp( auto_f1 );
  push_float( auto_f );
}
primitive( "float-exp", primitive_float_exp );


/*
 *  float-floor - floor of a float
 */

function primitive_float_floor(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.floor( auto_f1 );
  //c/ auto  auto_f = floor( auto_f1 );
  push_float( auto_f );
}
primitive( "float-floor", primitive_float_floor );


/*
 *  float-ceiling - ceiling of a float
 */

function primitive_float_ceiling(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.ceil( auto_f1 );
  //c/ auto  auto_f = ceil( auto_f1 );
  push_float( auto_f );
}
primitive( "float-ceiling", primitive_float_ceiling );


/*
 *  float-round - round a float
 */

function primitive_float_round(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.round( auto_f1 );
  //c/ auto  auto_f = round( auto_f1 );
  push_float( auto_f );
}
primitive( "float-round", primitive_float_round );


/*
 *  float-truncate - truncate a float
 */

function primitive_float_truncate(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.trunc( auto_f1 );
  //c/ auto  auto_f = trunc( auto_f1 );
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
 *  text-cut - extract a cut of a text, remove a suffix
 */

function primitive_text_cut(){
  const n = pop_integer();
  const auto_t = pop_as_text();
  push_text( tcut( auto_t, n ) );
}
primitive( "text-cut", primitive_text_cut );


/*
 *  text-length - length of a text
 */

function primitive_text_length(){
  const auto_t = pop_as_text();
  push_integer( tlen( auto_t ) );
}
primitive( "text-length", primitive_text_length );


/*
 *  text-but - remove a prefix from a text, keep the rest
 */

function               primitive_text_but(){
  const n = pop_integer();
  const auto_t = pop_as_text();
  push_text( tbut( auto_t, n ) );
}
primitive( "text-but", primitive_text_but );


/*
 *  text-mid - extract a part of the text
 */

function primitive_text_mid(){
  const n = pop_integer();
  const m = pop_integer();
  const auto_t = pop_as_text();
  push_text( tmid( auto_t, m, n ) );
}
primitive( "text-mid", primitive_text_mid );


/*
 *  text-low - convert a text to lower case
 */

function primitive_text_low(){
  const auto_t = pop_as_text();
  push_text( tlow( auto_t ) );
}
primitive( "text-low", primitive_text_low );


/*
 *  text-up - convert a text to upper case
 */

function primitive_text_up(){
  const auto_t = pop_as_text();
  push_text( tup( auto_t ) );
}
primitive( "text-up", primitive_text_up );


/*
 *  text=? - compare two texts
 */

function primitive_text_eq(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_boolean( teq( auto_t1, auto_t2 ) );
}
primitive( "text=?", primitive_text_eq );


/*
 *  text<>? - compare two texts
 */

function primitive_text_neq(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_boolean( tneq( auto_t1, auto_t2 ) );
}
primitive( "text<>?", primitive_text_neq );


/*
 *  text-find - find a piece in a text
 */

function primitive_text_find(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_integer( tidx( auto_t1, auto_t2 ) );
}
primitive( "text-find", primitive_text_find );


/*
 *  text-find-last - find a piece in a text
 */

function primitive_text_find_last(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_integer( tidxr( auto_t1, auto_t2 ) );
}
primitive( "text-find-last", primitive_text_find_last );


/*
 *  text-line - extract a line from a text
 */

function  primitive_text_line(){
  const n = pop_integer();
  const auto_t = pop_as_text();
  push_text( extract_line( auto_t, n ) );
}
primitive( "text-line", primitive_text_line );


/*
 *  as-text - textual representation
 */

function primitive_as_text(){
  if( type_of( TOS ) == type_text )return;
  push_text( pop_as_text() );
}
primitive( "as-text", primitive_as_text );


/*
 *  dump - textual representation, debug style
 */

function primitive_dump(){
  push_text( dump( POP() ) );
}
primitive( "dump", primitive_dump );


/*
 *  ""? unary operator
 */


const tag_empty_text = tag( "empty?" );


function is_empty_text_cell( c : Cell ) : boolean {
  if( value_of( c ) != the_empty_lean )return false;
  if( type_of(  c ) != type_text      )return false;
  return true;
}


/*
 *  ""? unary operator - true if TOS is the empty text
 */

function primitive_is_empty_text(){
  if( type_of( TOS ) != type_text ){
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
  if( name_of( c ) == t ){
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

  t = type_of( c );
  n = name_of( c );

  // If code is a primitive. That's when type is void; what a trick!
  if( t == type_void ){

    if( get_primitive( n ) == no_operation ){
      return S()+ "Invalid primitive cell " + C( c )
      + " named " + C( n )
      + " (" + ( tag_is_valid( n ) ? tag_to_text( n ) : no_text ) + ")";
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
    if( ! tag_is_valid( n ) ){
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


function verb_flags_dump( flags : i32 ) : Text {
// Return a text that describes the flags of an Inox verb
  // Note: the flags parameter should be a u32 but i32 makes things easier
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
  let def = definition_of( id );

  // The prior cell stores flags & length
  let flags_and_length = value_of( def - ONE );
  let flags  = flags_and_length & verb_flags_mask;
  let length = flags_and_length & verb_length_mask;

  // ToDo: add a pointer to the previous verb definition

  let auto_buf = S();
  auto_buf += ": " + auto_text_name + " ( definition of " + auto_text_name
  + ", verb " + N( id )
  + ", cell " + C( def )
  + ( flags != 0 ? ( S()+ ", flags" + verb_flags_dump( flags ) ) : no_text )
  + ", length " + N( length ) + " )\n";

  let ip = 0;
  let c  = 0;

  while( ip < length ){
    c = def + ip * ONE;
    // Filter out final "return"
    if( ip + 1 == length ){
      de&&mand_eq( value_of( c ), 0x0 );
      de&&mand_eq( type_of(  c ), type_void );
    }
    auto_buf += "( " + N( ip ) + " ) "
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
 *  peek - Get the value of a cell, using a cell's address.
 *  This is very low level, it's the Forth @ word (fetch).
 *  Peek/Poke is BASIC style, it's not Forth style.
 */

function primitive_peek(){
  copy_cell( value_of( TOS ), TOS );
}
primitive( "peek", primitive_peek );


/*
 *  poke - Set the value of a cell, using a cell's address.
 *  This is very low level, it's the Forth ! word (store).
 */

function primitive_poke(){
  const address = pop_integer();
  const tos = POP();
  move_cell( tos, address );
}
primitive( "poke", primitive_poke );



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
    mand_eq( definition_of( name_id ), def );
    mand_eq(
      value_of( definition_of( name_id ) + ONE ),
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
  const name_id = value_of( name_cell );
  const exists = verb_exists( tag_to_text( name_id ) );
  reset( name_cell );
  set( name_cell, type_boolean, tag_is_defined, exists ? 1 : 0 );
}
primitive( "defined?", primitive_is_defined );


/*
 *  make-global - Create a global variable and two verbs to
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
  const getter_def = definition_of( name_id );
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
  // const at_def = definition_of( at_name_id );
  // ToDo: store address as cell-pointer type, not as an integer
  // set( at_def, type_integer, at_name_id, getter_def );

}
primitive( "make-global", primitive_make_global );


/*
 *  make-local - Create a local variable in the control stack
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
  if( type_of( c ) != type_integer ){
    return false;
  }
  if( name_of( c ) != tag_block ){
    return false;
  }
  if( type_of( value_of( c ) - ONE ) != type_integer ){
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

  while( name_of( CSP ) != tag_with ){
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
  IP = eat_ip( CSP );
  CSP -= ONE;

}
primitive( "return-without-parameters", primitive_return_without_parameters );


/*
 *  run-with-parameters primitive
 */

const tag_run_with_parameters = tag( "run-with-parameters" );

// In C++, the definition is available later, see init_globals()
let return_without_parameters_definition = 0;
// = definition_of( tag_return_without_parameters );


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
    parameter_name = name_of( new_tos );
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
      de&&mand_name( value_of( formal_parameter_cell ), tag( "a") );
      de&&mand_name( name_of(  formal_parameter_cell ), tag( "a") );
      copy_count++;
      continue;
    }

    if( copy_count == 1 ){
      mand_name( value_of( formal_parameter_cell ), tag( "a" ) );
      mand_name( name_of(  formal_parameter_cell ), tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( name_of( formal_parameter_cell ), tag( "b" ) );
    }

    n = name_of( formal_parameter_cell );
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
    type_ip,
    tag_return_without_parameters,
    return_without_parameters_definition
  );

  // Execute the block, on return it will jump to the parameters remover
  IP = block;

}
primitive( "run-with-parameters", primitive_run_with_parameters );


/*
 *  local - copy a control variable to the data stack
 */

function primitive_local(){
// Copy the value of a control variable from the control stack to the data one
  const n = eat_tag( TOS );
  // Starting from the top of the control stack, find the variable
  let ptr = CSP;
  while( name_of( ptr ) != n ){
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
 *  set-local - assign a value to a local variable
 */

function primitive_set_local(){
  const n = pop_tag();
  // Starting from the top of the control stack, find the variable
  let ptr = CSP;
  while( name_of( ptr ) != n ){
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
  while( name_of( ptr ) != n ){
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
  while( name_of( ptr ) != n ){
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
static Cell cell_lookup(
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
      if( name_of( ptr ) == tag ){
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
      if( name_of( ptr ) == tag ){
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
    found = name_of( ptr ) == tag && nth == 0 ? ptr : 0;
  }
  return found;
}


/*
 *  lookup - find a variable in a memory area.
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
  de&&mand_eq( type_of( TOS ), type_integer );
  const nth        = value_of( POP() );
  de&&mand_eq( type_of( TOS ), type_tag );
  const n = name_of( TOS );
  let found = cell_lookup( CSP, ACTOR_control_stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    reset( TOS );
  }
}
primitive( "upper-local", primitive_upper_local );


/*
 *  upper-data - get a data variable in the nth upper frame, or void
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
 *  set-upper-local - set a local variable in the nth upper frame
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
 *  set-upper-data -
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
 *  without-data - remove down to a data variable in the data stack
 */

function primitive_without_data(){
  const n = pop_tag();
  while( name_of( TOS ) != n ){
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

/*ts{*/

function make_circular_object_from_js( obj : any, met : Map< string, any> ) : Cell {

  // The first item is the name of the class.
  const class_name = tag( obj.constructor.name );

  // How many properties are there inside that object?
  const keys = obj.keys();
  const length = keys.length;

  // Allocate enough memory to hold all of that
  const area = allocate_area( length * size_of_cell );

  // First cell is name:length
  init_cell( area, length, pack( type_integer, class_name ) );
  let top = area + size_of_word;

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
      cell_free( c );
    }
    top += ONE;
  }

  return area;

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

/*}*/


function  object_length( header : Cell ) : Count {
// Get the number of cells of the object
  // This does not include the headers used for memory management
  // The first cell of the object contains the length, whereas the
  // it's name is the class of the object. That first cell is not
  // included in the length.
  const length = value_of( header );
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
  const length     = value_of( TOS );
  const class_name = name_of(  TOS );

  // ToDo: should there be an upper limit on the length?
  check_de&&mand( length > 0 && length < 100 );

  // Allocate a cell for the class/length and cells for the values
  const dest_area = allocate_area( max_length * size_of_cell );
  if( dest_area == 0 ){
    // ToDo: raise an exception?
    set( TOS, type_tag, tag_out_of_memory, 0 );
    return;
  }

  // Move the values from the stack to the object
  // ToDo: this could be optimized by moving the whole area at once
  // but that would require to reverse the order of the values on the stack
  let ii;
  for( ii = 0 ; ii < length; ii++ ) {
    raw_move_cell( POP(), dest_area + ii * ONE );
  }

  // The first element is the named length
  de&&mand_eq( value_of( dest_area ), length );
  de&&mand_eq( name_of(  dest_area ), class_name );

  // Return the named reference to the object
  // ToDo: should skip the first cell and skip the header as done with areas?
  set( PUSH(), type_reference, class_name, dest_area );
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

  const obj = pop_reference();
  const len = object_length( obj );

  // Silently ignore if alreay extended
  if( type_of( obj ) == type_reference ){
    return;
  };

  // Allocate the extended area
  const area = allocate_area( len * size_of_cell );
  if( area == 0 ){
    // ToDo: raise an exception, return 0?
    FATAL( "out-of-memory" );
  }

  // Move the object's attributes to the extended area
  move_cells( obj, area, len );

  // Change the type of the object's content
  set( obj, type_reference, name_of( obj ), area );

  // Free the now unused portion of the fixed object's area
  resize_area( obj, 1 * ONE * size_of_cell );

}


/*
 *  object-get primitive
 */

primitive( "object-get", primitive_object_get );
function                 primitive_object_get(){
// Copy the value of an instance variable from an object

  const tos = POP();
  const obj = TOS;
  let ptr = value_of( obj );

  // Void from void
  if( ptr == 0x0 ){
    de&&mand( info_of( obj ) == 0 );
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
  if( type_of( ptr ) == type_reference ){
    ptr = reference_of( ptr );
  }

  let limit = 0;
  if( check_de ){
    limit = ptr + object_length( ptr ) * ONE;
  }

  // Skip the class name & length header first cell
  ptr += ONE;

  const n = name_of( tos );
  while( name_of( ptr ) != n ){
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
  // ToDo: the obj is not clear
  reset( obj );
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
  let ptr = value_of( obj );

  // Add an indirection level if objet is extensible
  if( type_of( ptr ) == type_reference ){
    ptr = reference_of( ptr );
  }

  let limit = 0;
  if( check_de ){
    limit = ptr + object_length( ptr ) * ONE;
  }

  // Skip the class name & length header first cell
  ptr += ONE;

  // Find the cell with the desired name
  while( name_of( ptr ) != n ){
    // ToDo: go backward?
    ptr += ONE;
    if( check_de && limit != 0 ){
      if( ptr > limit ){
        FATAL( "Object variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }

  // ToDo: optimize this, the target name is alreay ok
  reset( ptr );
  move_cell( POP(), ptr );

  // Restore initial name
  set_name( ptr, n );
  // ToDo: the obj is not clear
  clear( obj );

}


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object
 */

/*
 *  stack-push - push a value onto a stack object
 */

function primitive_stack_push(){
  const value_cell = POP();
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  move_cell( value_cell, target + length * ONE );
  set_value( target, length + 1 );
}
primitive( "stack-push", primitive_stack_push );


/*
 *  stack-drop - drop the top of a stack object
 */

function primitive_stack_drop(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    FATAL( "stack-pop, empty stack" );
    return;
  }
  move_cell( target + length * ONE, PUSH() );
  set_value( target, length - 1 );
}
primitive( "stack-drop", primitive_stack_drop );


/*
 *  stack-drop-nice - drop the tof of a stack object, unless empty
 */

function primitive_stack_drop_nice(){
  // Pop a value from the stack of an object, no error if stack is empty
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 )return;
  move_cell( target + length * ONE, PUSH() );
  set_value( target, length - 1 );
}
primitive( "stack-drop-nice", primitive_stack_drop_nice );


/*
 *  stack-fetch - get the nth entry of a stack object
 */

function primitive_stack_fetch(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    FATAL( "stack-fetch, empty stack" );
    return;
  }
  copy_cell( target + length * ONE, PUSH() );
}
primitive( "stack-fetch", primitive_stack_fetch );


/*
 *  stack-fetch-nice - get the nth entry of a stack object, or void
 */

function primitive_stack_fetch_nice(){
// Fetch a value from the stack of an object, no error if stack is empty
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    PUSH();
    return;
  }
  copy_cell( target + length * ONE, PUSH() );
}
primitive( "stack-fetch-nice", primitive_stack_fetch_nice );


/*
 *  stack-length - get the depth of a stack object
 */

function primitive_stack_length(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  push_integer( length );
}
primitive( "stack-length", primitive_stack_length );


/*
 *  stack-capacity - get the capacity of a stack object
 */

const tag_stack_capacity = tag( "stack-capacity" );

function primitive_stack_capacity(){
  let target = pop_reference();
  push_integer( stack_capacity( target ) );
  set_tos_name( tag_stack_capacity );
}
primitive( "stack-capacity", primitive_stack_capacity );


/*
 *  stack-dup - duplicate the top of a stack object
 */

function primitive_stack_dup(){
  stack_dup( pop_reference() );
}
primitive( "stack-dup", primitive_stack_dup );


/*
 *  stack-clear - clear a stack object
 */

function primitive_stack_clear(){
  stack_clear( pop_reference() );
}
primitive( "stack-clear", primitive_stack_clear );


/**/ function swap_cell( c1 : Cell, c2 : Cell ){
//c/ void swap_cell( Cell c1, Cell c2 ) {
  move_cell( c1, the_tmp_cell );
  move_cell( c2, c1 );
  move_cell( the_tmp_cell, c2 );
}


/*
 *  stack-swap - swap the top two values of a stack object
 */

function primitive_stack_swap(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length < 2 ){
    FATAL( "stack-swap, stack too short" );
    return;
  }
  swap_cell( target, target - 1 * ONE );
}
primitive( "stack-swap", primitive_stack_swap );


/*
 *  stack-swap-nice - like swap but ok if stack is too short
 */

function primitive_stack_swap_nice(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length < 2 )return;
  swap_cell( target, target - 1 * ONE );
}
primitive( "stack-swap-nice", primitive_stack_swap_nice );


/*
 *  stack-enter - swith stack to the stack of an object
 */

const tag_stack_base  = tag( "stack-base" );
const tag_stack_limit = tag( "stack-limit" );
const tag_stack_top   = tag( "stack-top" );


function primitive_stack_enter(){

  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }

  const length = value_of( target );
  if( length == 0 ){
    FATAL( "stack-enter, empty stack" );
    return;
  }

  CSP += ONE;
  set( CSP, type_reference, tag_stack_base, ACTOR_data_stack );
  area_lock( ACTOR_data_stack );

  ACTOR_data_stack = target;
  CSP += ONE;
  set( CSP, type_integer, tag_stack_limit, ACTOR_data_stack_limit );

  ACTOR_data_stack_limit = target + to_cell( area_size( target ) );
  CSP += ONE;
  set( CSP, type_integer, tag_stack_top, TOS );
  TOS = target + length * ONE;

}
primitive( "stack-enter", primitive_stack_enter );


/*
 *  stack-leave - revert to the previous data stack
 */

function primitive_stack_leave(){

  TOS = eat_reference( CSP );
  CSP -= ONE;

  ACTOR_data_stack_limit = eat_integer( CSP );
  CSP -= ONE;

  ACTOR_data_stack = eat_integer( CSP );
  CSP -= ONE;

}
primitive( "stack-leave", primitive_stack_leave );


/*
 *  data-stack-base - return the base address of the data stack
 */

const tag_data_stack_base  = tag( "data-stack-base" );

function primitive_data_stack_base(){
  push_integer( ACTOR_data_stack );
  set_tos_name( tag_data_stack_base );
}
primitive( "data-stack-base", primitive_data_stack_base );


/*
 *  data-stack-limit - upper limit of the data stack
 */

const tag_data_stack_limit = tag( "data-stack-limit" );

function primitive_data_stack_limit(){
  push_integer( ACTOR_data_stack_limit );
  set_tos_name( tag_data_stack_limit );
}
primitive( "data-stack-limit", primitive_data_stack_limit );


/*
 *  control-stack-base - base address b of the control stack
 */

const tag_control_stack_base  = tag( "control-stack-base" );

function primitive_control_stack_base(){
  push_integer( ACTOR_control_stack );
  set_tos_name( tag_control_stack_base );
}
primitive( "control-stack-base", primitive_control_stack_base );


/*
 *  control-stack-limit - upper limit s of the control stack
 */

const tag_control_stack_limit = tag( "control-stack-limit" );

function primitive_control_stack_limit(){
  push_integer( ACTOR_control_stack_limit );
  set_tos_name( tag_control_stack_limit );
}
primitive( "control-stack-limit", primitive_control_stack_limit );


/*
 *  grow-data-stack - double the data stack if 80% full
 */

function  primitive_grow_data_stack(){
// When current actors data stack is more than 80% full, grow it
  const length = ACTOR_data_stack_limit - ACTOR_data_stack;
  const current_length = TOS - ACTOR_data_stack;
  // If less than 80% full, do nothing
  if( current_length < ( length * 100 ) / 80 ){
    return;
  }
  const new_length = length * 2;
  const new_stack_area = allocate_area( new_length * size_of_cell );
  if( new_stack_area == 0 ){
    FATAL( "grow-control-stack, out of memory" );
    return;
  }
  move_cells( ACTOR_data_stack, new_stack_area, length );
  area_free( ACTOR_data_stack );
  ACTOR_data_stack = new_stack_area;
  ACTOR_data_stack_limit = new_stack_area + new_length;
  TOS = new_stack_area + current_length;
}
primitive( "grow-data-stack", primitive_grow_data_stack );


/*
 *  grow-control-stack - double the control stack if 80% full
 */

function primitive_grow_control_stack(){
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
  area_free( ACTOR_control_stack );
  ACTOR_control_stack = new_stack;
  ACTOR_control_stack_limit = new_stack + new_length;
  CSP = new_stack + current_length;
}
primitive( "grow-control-stack", primitive_grow_control_stack );


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as a queue
 */

/*
 *  queue-push primitive
 */

function primitive_queue_push(){
  primitive_stack_push();
}
primitive( "queue-push", primitive_queue_push );


/*
 *  queue-length primitive
 */

function primitive_queue_length(){
  primitive_stack_length();
}
primitive( "queue-length", primitive_queue_length );


/*
 *  queue-pull primitive
 */

function primitive_queue_pull(){

  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value_of( TOS );
  clear( TOS );
  POP();
  const queue_length = value_of( queue );
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
primitive( "queue-pull", primitive_queue_pull );


/*
 *  queue-capacity primitive
 */

const tag_queue_capacity = tag( "queue-capacity" );

function primitive_queue_capacity(){
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value_of( TOS );
  clear( TOS );
  POP();
  const queue_capacity = to_cell( area_size( queue ) );
  push_integer( queue_capacity - 1 );
  set_tos_name( tag_queue_capacity );
}
primitive( "queue-capacity", primitive_queue_capacity );


/*
 *  queue-clear primitive
 */

function primitive_queue_clear(){
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value_of( TOS );
  clear( TOS );
  POP();
  const queue_length = value_of( queue );
  let ii;
  for( ii = 0 ; ii < queue_length ; ii++ ){
    clear( queue + ( ii + 1 ) * ONE );
  }
  set_value( queue, 0 );
}
primitive( "queue-clear", primitive_queue_clear );


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as an array
 */

/*
 *  array-put primitive
 */

function primitive_array_put(){
  const value_cell = TOS;
  const index_cell = TOS - ONE;
  check_de&&mand_integer( index_cell );
  const index = value_of( index_cell );
  const array_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_length = value_of( array );
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
primitive( "array-put", primitive_array_put );


function primitive_array_get(){
  const index_cell = TOS;
  check_de&&mand_integer( index_cell );
  const index = value_of( index_cell );
  const array_cell = TOS - ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_length = value_of( array );
  if( index < 0 || index >= array_length ){
    FATAL( "array-get, index out of range" );
    return;
  }
  reset( index_cell );
  copy_cell( array + ( index + 1 ) * ONE, TOS );
  clear( array_cell );
  TOS -= 2 * ONE;
}
primitive( "array-get", primitive_array_get );


/*
 *  array-length primitive
 */

const tag_array_length = tag( "array-length" );

function primitive_array_length(){
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_length = value_of( array );
  clear( array_cell );
  set( TOS, type_integer, tag_array_length, array_length );
}
primitive( "array-length", primitive_array_length );


/*
 *  array-capacity primitive
 */

const tag_array_capacity = tag( "array-capacity" );

function primitive_array_capacity(){
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_capacity = to_cell( area_size( array ) );
  clear( array_cell );
  set( TOS, type_integer, tag_array_capacity, array_capacity - 1 );
}
primitive( "array-capacity", primitive_array_capacity );


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as a map
 */

/*
 *  map-put primitive
 */

function primitive_map_put(){
  const value_cell = TOS;
  const name_id = name_of( value_cell );
  const map_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value_of( map_cell );
  const map_length = value_of( map );
  const map_capacity = to_cell( area_size( map ) );
  // Search for the key
  let ii = 0;
  while( ii < map_length ){
    if( name_of( map + ( ii + 1 ) * ONE ) == name_id ){
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
primitive( "map-put", primitive_map_put );


/*
 *  map-get primitive
 */

function primitive_map_get(){
  const key_cell = TOS;
  de&&mand_tag( key_cell );
  const map_cell = TOS - ONE;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value_of( map_cell );
  const map_length = value_of( map );
  // Search for the key
  let ii = 0;
  while( ii < map_length ){
    if( name_of( map + ( ii + 1 ) * ONE ) == name_of( key_cell ) ){
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
primitive( "map-get", primitive_map_get );


/*
 *  map-length primitive
 */

const tag_map_length = tag( "map-length" );

function primitive_map_length(){
  const map_cell = TOS;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value_of( map_cell );
  const map_length = value_of( map );
  clear( map_cell );
  set( TOS, type_integer, tag_map_length, map_length );
  set_tos_name( tag_map_length );
}
primitive( "map-length", primitive_map_length );


/* ----------------------------------------------------------------------------
 *  Type range
 *  A range is a pair of integers, index + length or index + index.
 *  ToDo:
 *    small ranges should be stored in the cell itself
 *    larger ranges should be stored in a separate area, the heap typically.
 *  Some possible encodings :
 *    [ 0 .. 0 ]    - an empty range
 *    [ -1 .. -1 ]  - the last element of something
 *    [ -1 .. 0 ]   - some place after the last element of something
 *    [ 0 .. 1 ]    - the first element of something
 *    [ 0 .. -1 ]   - the totality of something
 *    [ n .. n+1 ]  - a range that is the index of a single element
 *    [ 0 .. n ]    - a range that is a portion at the beginning of something
 *    [ n .. m ]    - a range that is a portion of something
 *    [ n .. -l ]   - a range that is a portion at the end of something
 *    [ -n .. -m ]  - a portion at the end of something
 *    [ -n .. m ]   - a portion at the end from a start position
 *    [ -n .. 0 ]   - a portion at the end from the beginning
 *    This makes a total of less than 16 different ranges, ie 4 bits ids.
 *    A range may be "bound" to a specific entity, like a text or an array.
 *    When a range is bound to an integer, the integer is a cursor.
 *    Wherever an entity is used, a bound range may be used instead.
 *    A bound range behaves like an iterator when it is incremented.
 *    Arithmetic of ranges:
 *      r + n  - move forward in range, if n is negative, move backward
 *      r - n  - move backward in range, if n is negative, move forward
 *      a + b  - [ a.start + b.start, a.end + b.end ] ?
 *      a - b  - [ a.start - b.start, a.end - b.end ] ?
 *      a * b  - [ min( a.start, b.start ), max( a.end, b.end ) ] ?
 *      a / b  - [ max( a.start, b.start ), min( a.end, b.end ) ] ?
 *    To pack a range into a 32 bits word, we need to allocate bits for the
 *    start position and for either the end or length.
 *    When a range is bound, 1 bit is used to indicate that it is bound, the
 *    other bits are the address of the dynamic area where the range is stored
 *    together with the entity it is bound to. When stored this way, the name
 *    portion of the cell has 28 bits available. Semantically, the name is
 *    the name of the entity the range is bound to. This is necessary to
 *    process ranges as if they were the entity they are bound to, ie to
 *    use a range in all places where an entity is used.
 *    When either the start or the end is big, the range is stored in the
 *    heap with enough space to store the start and the end.
 *    Ranges can implement slices, ie a portion of an entity.
 *    In C++, string_view, span and range are related concepts.
 *    Ranges are qualified references.
 *
 *    Packing is an optimization, a first implementation may skip it.
 *    - range.new
 *    - range.new-slice( start, end )
 *    - range.from( start )
 *    - range.to( end )
 *    - range.for( length )
 *    - range.from-to( start, end )
 *    - range.from-for( start, length )
 *    - range.to-for( end, length )
 *    - range.start
 *    - range.end
 *    - range.length
 *    - range.empty?
 *    - range.contains?( another_range )
 *    - range.intersects?( another_range )
 *    - range.extend( another_range )
 *    - range.restrict( another_range )
 *    - range.next
 *    - range.previous
 *    - range.type
 *    - range.value
 *    - range.name
 *    - range.bound?
 *    - range.bind( entity )
 *    - range.unbind
 *    - range.extract
 *    - range.inject( something )
 */

/* ----------------------------------------------------------------------------
 *  Primitives to handle the control stack local variables
 */

/*
 *  without-local - clear the control stack downto to specified local
 */

function primitive_without_local(){
  const n = pop_tag();
  while( name_of( CSP ) != n ){
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
primitive( "without-local", primitive_without_local );


/*
 *  return-without-locals - like return but with some cleanup
 */

function primitive_return_without_locals(){
// Return after a clear down to the local variable with sentinel included
  while( name_of( CSP ) != tag_with ){
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
primitive( "return-without-locals", primitive_return_without_locals );


/*
 *  with-locals primitive
 */

const tag_return_without_locals = tag( "return-without-locals" );

// Cannot initialize here in C++, see init_globals()
let return_without_locals_definition = 0;
// = definition_of( tag_return_without_locals );


function primitive_with_locals(){
// Prepare for a run that may create local variables
  CSP += ONE;
  set( CSP, type_ip, tag_with, IP );
  CSP += ONE;
  set( CSP, type_ip, tag_with, tag_return_without_locals );
}
primitive( "with-locals", primitive_with_locals );


/* ----------------------------------------------------------------------------
 *  Methods calls & other calls with the it local variable
 */

/*
 *  return-without-it primitive
 */


const tag_run_with_it = tag( "run-with-it" );

function primitive_return_without_it(){
// Return after a clear down to the 'it' local variable included
  while( name_of( CSP ) != tag_it ){
    clear( CSP );
    CSP -= ONE;
    if( CSP < ACTOR_control_stack ){
      FATAL( "without-it, 'it' is missing" );
      return;
    }
  }
  reset( CSP );
  CSP -= ONE;
  de&&mand( name_of( CSP ) == tag_run_with_it );
  IP = eat_ip( CSP );
  CSP -= ONE;
}
primitive( "return-without-it", primitive_return_without_it );


/*
 *  with-it primitive
 */

const tag_with_it           = tag( "with-it" );
const tag_return_without_it = tag( "return-without-it" );

// See init_globals() where this definition is set
let return_without_it_definition = 0;
// = definition_of( tag_return_without_it );


function primitive_with_it(){
// Prepare for a call to a block that expects an 'it' local variable

  CSP += ONE;
  set( CSP, type_ip, tag_with, IP );

  CSP += ONE;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );

  // Block will return to the definition of return-without-it
  CSP += ONE;
  set(
    CSP,
    type_ip,
    tag_run_with_it,
    return_without_it_definition
  );

}
primitive( "with-it", primitive_with_it );


/*
 *  it primitive
 */

function primitive_it(){
// Push the value of the it control variable onto the data stack
  let ptr = CSP;
  while( name_of( ptr ) != tag_it ){
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
primitive( "it", primitive_it );


/*
 *  it! primitive
 */

primitive( "it!", primitive_set_it );
function          primitive_set_it(){
// Change the value of the 'it' local variable
  let ptr = CSP;
  while( name_of( ptr ) != tag_it ){
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_control_stack ){
        FATAL( "Local variable 'it' not found" );
        return;
      }
    }
  }
  // ToDo: optimize this, the name is alreay ok
  reset( ptr );
  move_cell( POP(), ptr );
  set_name( ptr, tag_it );
}


/*
 *  run-method-by-name primitive
 */

function primitive_run_method_by_name(){
// Call method by name
  // ToDo: should check against a type_text
  const name_id = pop_tag();
  const auto_verb_name = tag_to_text( name_id );
  let target = TOS;
  const target_type = type_of( target );
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
  set( CSP, type_ip, name_id, IP );
  IP = definition_of( verb_id );
}
primitive( "run-method-by-name", primitive_run_method_by_name );


/*
 *  run-method-by-tag primitive
 */

function primitive_run_method_by_tag(){
  check_de&&mand_tag( TOS );
  // ToDo: should not reuse primitive as it is because it should expect a text
  primitive_run_method_by_name();
}
primitive( "run-method-by-tag", primitive_run_method_by_tag );


/*
 *  run-with-it - like run but with an "it" local variable
 */

function primitive_run_with_it(){
  const block = pop_block();
  // Push normal return address onto control stack
  CSP += ONE;
  set( CSP, type_ip, tag_run_with_it, IP );
  // Push local variable 'it'
  CSP += ONE;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );
  // Push special return address to local variables cleaner
  CSP += ONE;
  set(
    CSP,
    type_ip,
    tag_return_without_it,
    return_without_it_definition
  );
  // Jump into block definition
  IP = block;
}
primitive( "run-with-it", primitive_run_with_it );


/* ---------------------------------------------------------------------------
 *  low level unsafe access to CSP, TOS & IP registers
 */

/*
 *  words_per_cell primitive
 */

const tag_words_per_cell = tag( "words-per-cell" );

function primitive_words_per_cell(){
  set( PUSH(), type_integer, tag_words_per_cell, ONE );
}
primitive( "words-per-cell", primitive_words_per_cell );


/*
 *  CSP primitive
 */


const tag_CSP = tag( "CSP" );

function primitive_CSP(){
  set( PUSH(), type_integer, tag_CSP, CSP );
}
primitive( "CSP", primitive_CSP );


/*
 *  set-CSP primitive
 */

function primitive_set_CSP(){
  CSP = pop_integer();
}
primitive( "set-CSP", primitive_set_CSP );


/*
 *  TOS primitive
 */

const tag_TOS = tag( "TOS" );

function primitive_TOS(){
  const tos = TOS;
  set( PUSH(), type_integer, tag_TOS, tos );
};
primitive( "TOS", primitive_TOS );


/*
 *  set-TOS primitive
 */

function primitive_set_TOS(){
  TOS = pop_integer();
};
primitive( "set-TOS", primitive_set_TOS );


/*
 *  IP primitive
 */

const tag_IP = tag( "IP" );

function primitive_IP(){
  set( PUSH(), type_integer, tag_IP, IP );
}
primitive( "IP", primitive_IP );


/*
 *  set-IP primitive
 */

function primitive_set_IP(){
  IP = pop_integer();
}
primitive( "set-IP", primitive_set_IP );


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


/*ts{*/

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

/*}*/


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

/*ts{*/

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
  let n;
  /*c{
    #ifdef INOX_FAST
      #define INOX_FAST_RUN
    #endif
    #ifdef INOX_FAST_RUN
      #undef  INOX_FAST_RUN
      #define INOX_FAST_RUN true
     #else
      #define INOX_FAST_RUN false
    #endif
    u64 w64;
    // #define RUN_DEBUG
    #ifdef RUN_DEBUG
      u32 debug_info;
      u32 debug_type;
      i32 debug_value;
      u32 debug_name;
    #endif
  }*/

  // ToDo: fast_ip, fast_csp, fast_tos when hand optimized machine code?
  /*c{
    #define RUN_FAST_FAST
    #ifdef RUN_FAST_FAST
      let fast_ip  = IP;
      let fast_csp = CSP;
      let fast_tos = TOS;
    #endif
  }*/

  //c/ goto loop;
  //c/ break_loop: if( 0 )
  loop: while( true ){

    // ToDo: there should be a method to break this loop
    // There is one: set remainig_instructions_credit to 0
    // ToDo: interrupt/signal handlers should use that mechanism
    // if( must_stop )break;

    // ToDo: there should be a method to break this loop
    // ie remaining_instructions_credit = 0;
    // primitive that change IP should use that mechanism
    // That way, checking IP in the tight loop is not needed anymore
    while( remaining_instructions_credit-- ){

      // The non debug loop is realy short
      // It should be hand optimized in machine code
      if(
        !de
        //c/ || INOX_FAST_RUN
      ){

        if(
          /*c{
            #ifdef RUN_FAST_FAST
              !fast_ip
            #else
              !IP
            #endif
          }*/
          /**/ !IP
        ){
          /**/ break loop;
          //c/ goto break_loop;
        }

        // Fast C++ version, using a 64 bits read
        /*c{

          #ifdef RUN_DEBUG
            bug( S()
              + "\nRUN_DEBUG IP: "
              + inox_machine_code_cell_to_text( IP )
              + stacks_dump()
            );
            debug_info  = info_of(  IP );
            debug_type  = type_of(  IP );
            debug_name  = name_of(  IP );
            debug_value = value_of( IP );
          #endif

          // Read 64 bits at once, faster that reading 32 bits twice
          w64 = *(u64*)(
            #ifdef RUN_FAST_FAST
              fast_ip
            #else
              IP
            #endif
          << 3 );

          // void:void is a special case, return to the caller
          if( w64 == 0 ){

            #ifdef RUN_DEBUG
              mand_eq( debug_type,  type_void );
              mand_eq( debug_name,  tag_void );
              mand_eq( debug_value, 0 );
            #endif

            // The new IP is at the top of the control stack
            #ifdef RUN_FAST_FAST
              fast_ip = *(Cell*)( fast_csp << 3 );
            #else
              IP      = *(Cell*)( CSP      << 3 );
            #endif

            #ifdef RUN_DEBUG
              mand_eq( IP, value_of( CSP ) );
              mand_eq( type_of( CSP ), type_ip );
            #endif

            // Clear the top of the control stack
            // ToDo: really necessary?
            // *(u64*)( CSP << 3 ) = 0;

            #ifdef RUN_DEBUG
              mand_eq( tag_void, 0 );
              mand_eq( name_of( CSP ), tag_void );
              mand_eq( type_of( CSP ), type_void );
              mand_eq( value_of( CSP ), 0 );
            #endif

            // Pop operation on the control stack
            #ifdef RUN_FAST_FAST
              fast_csp--;
            #else
              CSP--;
            #endif

            // All done
            continue;
          }

          #if INOX_IS_LITTLE_ENDIAN
            t = w64 >> 60;
          #else
            #error "Not implemented"
          #endif
          #ifdef RUN_DEBUG
            mand_eq( t, debug_type );
          #endif

          // Primitives
          if( t == 0 ){

            // By default, the next instruction is the next one
            #ifdef RUN_FAST_FAST
              fast_ip++;
            #else
              IP++;
            #endif

            #ifdef RUN_DEBUG
              mand_eq( w64 >> 32, debug_info );
              mand_eq( w64 >> 32, debug_name );
            #endif

            // Note: primitives can change IP
            #ifdef RUN_FAST_FAST
              IP  = fast_ip;
              CSP = fast_csp;
              TOS = fast_tos;
            #endif
            all_primitives[ w64 >> 32 ]();
            #ifdef RUN_FAST_FAST
              fast_ip  = IP;
              fast_csp = CSP;
              fast_tos = TOS;
            #endif

            // All done
            continue;

          // Verbs
          }else if( t == type_verb ){

            // Make room for the return address
            #ifdef RUN_FAST_FAST
              fast_csp++;
            #else
              CSP++;
            #endif

            // Setup return address, named to help debugging
            *(u64*)(
              #ifdef RUN_FAST_FAST
                fast_csp
              #else
                CSP
              #endif
            << 3 ) = (
              #ifdef RUN_FAST_FAST
                fast_ip
              #else
                IP
              #endif
            + 1 ) | w64 & 0xffffffff00000000;

            #ifdef RUN_DEBUG
              mand_eq( value_of( CSP ), IP + 1 );
              mand_eq( name_of(  CSP ), debug_name );
              mand_eq( type_of(  CSP ), debug_type );
              mand_eq( value_of( IP  ), w64 & 0xffffffff );
            #endif

            #if INOX_IS_LITTLE_ENDIAN
              #ifdef RUN_FAST_FAST
                fast_ip
              #else
                IP
              #endif
              = w64 & 0xffffffff;
            #else
              #error "Not implemented"
            #endif

            #ifdef RUN_DEBUG
              mand_eq( IP, debug_value );
            #endif

            // All done
            continue;

          // Literals
          }else{

            // Make room for the literal on the data stack
            #ifdef RUN_FAST_FAST
              fast_tos++;
            #else
              TOS++;
            #endif

            // Raw copy
            #if INOX_IS_LITTLE_ENDIAN
              *(u64*)(
                #ifdef RUN_FAST_FAST
                  fast_tos
                #else
                  TOS
                #endif
              << 3 ) = w64;
            #else
              #error "Not implemented"
            #endif

            #ifdef RUN_DEBUG
              mand_eq( value_of( TOS ), value_of( IP ) );
              mand_eq( info_of(  TOS ), info_of(  IP ) );
              mand_eq( name_of(  TOS ), name_of(  IP ) );
            #endif

            // Increment the reference counter when needed
            if( t >= type_reference ){

              #ifdef RUN_DEBUG
                mand( t == type_reference || t == type_text );
                mand( is_sharable( IP ) );
              #endif

              #if INOX_IS_LITTLE_ENDIAN
                #ifdef RUN_DEBUG
                  mand_eq( (u32) w64, value_of( TOS ) );
                #endif
                // The reference counter is before the value, before the size
                ( *(u32*)( ( ( (u32) w64 ) - 2 * ONE ) << 3 ) )++;
              #else
                #error "Not implemented"
              #endif

              #ifdef RUN_DEBUG
                mand_eq(
                  name_of( value_of( TOS ) - 2 * ONE ),
                  tag_dynamic_ref_count
                );
              #endif

            }else{
              #ifdef RUN_DEBUG
                mand( !is_sharable( IP ) );
              #endif
            }

            // Double check
            #ifdef RUN_DEBUG
              mand_eq( value_of( TOS ), value_of( IP ) );
              mand_eq( info_of(  TOS ), info_of(  IP ) );
              mand_eq( name_of(  TOS ), name_of(  IP ) );
            #endif

            // Move to next instruction
            #ifdef RUN_FAST_FAST
              fast_ip++;
            #else
              IP++;
            #endif

            // All done
            continue;
          }

          // Never reached
          assert( false );
          continue;

        }*/

        /*ts{*/
          i = info_of( IP );
          if( i == 0x0000 ){
            // fast_ip = value_of( CSP );
            IP  = value_of( CSP );
            reset( CSP );
            CSP -= ONE;
            continue;
          }
          t = unpack_type( i );
          // If primitive
          if( t == type_primitive ){
            // fast_ip += ONE;
            // IP  = fast_ip;
            IP += ONE;
            // CSP = fast_csp;
            // TOS = fast_tos;
            get_primitive( i )();
            // fast_ip  = IP;
            // fast_csp = CSP;
            // fast_tos = TOS;
          // If Inox defined word
          }else if( t == type_verb ){
            // fast_csp += ONE;
            CSP += ONE;
            n = unpack_name( i );
            // ToDo: should avoid pack() here, ie push a verb onto csp
            init_cell( CSP, IP + ONE, pack( type_ip, n ) );
            // IP = definition_of( n );
            IP = value_of( IP );
          // If literal
          }else{
            // fast_tos += ONE;
            TOS += ONE;
            // ToDo: should inline copy_cell() here
            copy_cell( IP, TOS );
            IP += ONE;
          }
          continue;
        /*}*/

      // The debug mode version has plenty of checks and traces
      }else{

        // ToDo: use an exception to exit the loop,
        // together with some primitive_exit_run()
        /**/ if( !IP )break loop;
        //c/ if( !IP )goto break_loop;

        i = info_of( IP );

        if( verbose_stack_de ){
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

        // Special "next" code, 0x0000, is a jump to the return address.
        if( i == 0x0000 ){
          if( run_de ){
            bug( S()
              + "run, return to " + C( IP )
              + " of " + tag_to_text( name_of( CSP ) )
            );
          }
          // ToDo: check underflow?
          IP = eat_ip( CSP );
          CSP -= ONE;
          continue;
        }

        // What type of code this is, primitive, Inox verb or literal
        t = unpack_type( i );

        // Call to another verb, the name of the cell names it
        if( t == type_verb ){
          // Push return address into control stack, named to help debugging
          CSP += ONE;
          set( CSP, type_ip, unpack_name( i ), IP + ONE );
          // ToDo: set type to Act?
          // IP = definition_of( unpack_name( i ) );
          IP = value_of( IP );
          // bug( verb_to_text_definition( unpack_name( verb ) ) );
          continue;
        }

        // Call to a primitive, the name of the cell names it
        // ToDo: use a type instead of tricking the void type?
        if( t == type_void ){

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

      } // de

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
//c/ static void run_eval( void ){

  IP = definition_by_name( "eval" );
  de&&mand( !! IP );

  // Should return to here, hence IP 0
  CSP += ONE;
  set( CSP, type_ip, tag_eval, 0 );

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
//c/ static Text the_style( "" );


// TypeScript version uses a Map of Map objects
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
  return value_of( aliases );
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
 *  inox-dialect - switch to the Inox dialect
 */

function primitive_inox_dialect(){
  set_style( "inox" );
}
primitive( "inox-dialect", primitive_inox_dialect );



/*
 *  dialect - query current dialect text name
 */

const tag_dialect = tag( "dialect" );

function primitive_dialect(){
  push_text( the_style );
  set_tos_name( tag_dialect );
}
primitive( "dialect", primitive_dialect );


/*
 *  forth-dialect - switch to the Forth dialect
 */

primitive( "forth-dialect", primitive_forth_dialect );
function                    primitive_forth_dialect(){
  set_style( "forth" );
}


/*
 *  set-dialect - set current dialect
 */

function primitive_set_dialect(){
  set_style( pop_as_text() );
}
primitive( "set-dialect", primitive_set_dialect );


/*
 *  alias - add an alias to the current dialect
 */

function primitive_alias(){
  const auto_new_text = pop_as_text();
  const auto_old_text = pop_as_text();
  define_alias( the_style, auto_old_text, auto_new_text );
}
primitive( "alias", primitive_alias );


/*
 *  dialect-alias - add an alias to a dialect
 */

function primitive_dialect_alias(){
  const auto_style    = pop_as_text();
  const auto_new_text = pop_as_text();
  const auto_old_text = pop_as_text();
  define_alias( auto_style, auto_old_text, auto_new_text );
}
primitive( "dialect-alias", primitive_dialect_alias );


/*
 *  import-dialect - import a dialect into the current one
 */

function primitive_import_dialect(){
  const auto_imported_style = pop_as_text();
  const imported_dialect = aliases_by_style( auto_imported_style );
  // It is a stack, add all it's elements to the current dialect
  let ii = 0;
  while( ii < stack_length( imported_dialect ) ){
    let alias_cell = stack_at( imported_dialect, ii );
    let auto_alias = tag_to_text( name_of( alias_cell ) );
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
 *  literal - add a literal to the Inox verb beeing defined,
 *  or to a block.
 */


function primitive_literal(){
  eval_do_literal();
}
primitive( "literal", primitive_literal );


/*
 *  machine-code - add a machine code id to the verb beeing defined,
 *  or to a block.
 */

function primitive_do_machine_code(){
  eval_do_machine_code( pop_verb() );
}
primitive( "machine-code", primitive_do_machine_code );


/*
 *  inox - add next token as code for the verb beeing defined,
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
 *  quote - push next instruction instead of executing it.
 *  Must be inlined. It then move IP past the next instruction, ie it skips it.
 */

function primitive_quote(){
  let verb_id = name_of( IP );
  the_last_quoted_verb_id = verb_id;
  PUSH();
  raw_copy_cell( IP, TOS );
  // Skip the quoted instruction
  IP += ONE;
}
primitive( "quote", primitive_quote );


/* -----------------------------------------------------------------------------
 *  Primitives to change the flags attached to a verb.
 */

/*
 *  immediate - make the last defined verb immediate
 */

function primitive_immediate(){
  set_verb_immediate_flag( the_last_defined_verb );
}
primitive( "immediate", primitive_immediate );


/*
 *  hidden - make the last defined verb hidden
 *  ToDo: implement this and definition linked lists
 */

function primitive_hidden(){
  set_verb_hidden_flag( the_last_defined_verb );
}
primitive( "hidden", primitive_hidden );


/*
 *  operator - make the last defined verb an operator
 */

function primitive_operator(){
  set_verb_operator_flag( the_last_defined_verb );
}
primitive( "operator", primitive_operator );


/*
 *  inline - make the last defined verb inline
 */

function primitive_inline(){
  set_inline_verb_flag( the_last_defined_verb );
}
primitive( "inline", primitive_inline );


/*
 *  last-token - return the last tokenized item
 */

function primitive_last_token(){
  copy_cell( the_last_token_cell, PUSH() );
}
primitive( "last-token", primitive_last_token );


/*
 *  tag - make a tag, from a text typically
 */

function primitive_tag(){
  const t = tag( cell_to_text( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_tag, t );
}
primitive( "tag", primitive_tag );


/*
 *  run-tag - run a verb by tag
 */

function run_verb( verb_id : Index ){
  // Push return address onto control stack
  save_ip( verb_id );
  // Jump to verb definition, there is a "default" definition
  IP = definition_of( verb_id );
}


function primitive_run_tag(){
  run_verb( pop_tag() );
}
primitive( "run-tag", primitive_run_tag );


/*
 *  run-name - run a verb by text name
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
 *  run-verb - run a verb by verb id
 *  ToDo: unify with run-tag
 */

function primitive_run_verb(){
  de&&mand_cell_type( TOS, type_verb );
  const verb_id = eat_raw_value( TOS );
  run_verb( verb_id );
}
primitive( "run-verb", primitive_run_verb );


/*
 *  definition - get the definition of a verb
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
  const ip = definition_of( verb_id );
  set( TOS, type_integer, tag_definition, ip );
  de&&mand_block( TOS );
}
primitive( "definition", primitive_definition );

// ToDo: block-length & verb-flags


/*
 *  run - run a block or a verb definition
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
 *  run-definition - run a verb definition
 */

function primitive_run_definition(){
  // "inox Hello run" does what Hello does alone
  const verb_id = pop_integer();
  // ToDo: check that it is a valid verb id
  save_ip( verb_id );
  IP = definition_of( verb_id );
}
primitive( "run-definition", primitive_run_definition );


/*
 *  block - push the start address of the block at IP
 */


function block_length( ip : Cell ) : Count {
// Get the length of the block at ip
  check_de&&mand_eq( name_of( ip ), tag_block_header );
  const block_length = value_of( ip ) & 0xffff; // ToDo: block_length_mask?
  return block_length;
}


function block_flags( ip : Index ) : Index {
// Get the flags of the block at ip
  check_de&&mand_eq( name_of( ip ), tag_block_header );
  const block_flags = value_of( ip ) >> 16; // ToDo: block_flags_shift?
  return block_flags;
}


/*
 *  block - push the start address of the block at IP.
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
    const previous_cell_value = value_of( previous_cell );
    const previous_cell_type  = type_of(  previous_cell );
    const previous_cell_name  = name_of(  previous_cell );
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


/*ts{*/

abstract class TextStreamIterator {
  // Get next text to tokenize. REPL would readline() on stdin typically
  abstract next() : Text;
}

/*}*/


// When REPL, source code comes from some readline() function
/**/ let toker_stream  : TextStreamIterator;
//c/ static int toker_stream = -1;

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
 *  start-input - start reading from a given source code
 */

function primitive_inox_start_input(){
  tokenizer_restart( cell_to_text( TOS ) );
  clear( POP() );
}
primitive( "start-input", primitive_inox_start_input );


/*
 *  input - get next character in source code, or ""
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
 *  input-until - get characters until a given delimiter
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
 *  pushback-token - push back a token in source code stream
 */

function unget_token( t : Index, s : ConstText ){
  back_token_type = t;
  back_token_text = s;
}


function primitive_pushback_token(){
  const cell = POP();
  const n = name_of( cell );
  // ToDo: should handle the token type properly
  const typ = token_tag_to_type( n );
  unget_token( typ, cell_to_text( cell ) );
  clear( cell );
}
primitive( "pushback-token", primitive_pushback_token );


function ch_is_space( ch : ConstText ) : boolean {
  // ToDo: faster
  return teq( ch, "\n" )
  ||     teq( ch, "\r" )
  ||     teq( ch, "\t" )
  ||     teq( ch, " " );
}


/*
 *  whitespace? - true if TOS is a whitespace character
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
 *  next-character - get next character in source code, or ""
 */

const tag_next_character = tag( "next-character" );


function primitive_next_character(){
  const auto_ch = tokenizer_next_character();
  push_text( auto_ch );
  set_tos_name( tag_next_character );
}
primitive( "next-character", primitive_next_character );


/*
 *  digit? - true if the top of stack is a digit character
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


function ch_is_eol( ch : ConstText ) : boolean {
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
      //c/ next_ch += tmid( toker_text, ii + jj, ii + jj + 1 );
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
 *  It is synchronous, blocking the whole process.
 *  It is not thread safe.
 *  There is no dynamic memory involved and that comes with a limit to the
 *  line length, MAX_LINE_LENGTH, which is 2048, as per POSIX minimum.
 *  If a longer line is encountered, it is ignored, as well as the rest of
 *  the file, ie that line acts like an end of file.
 *  ToDo: make it thread safe.
 *  ToDo: make it asynchronous.
 *  ToDo: have a dynamic buffer when asked.
 *  ToDo: configure the max length.
 *  ToDo: configure the new line delimiter, including -1 for none.
 *  ToDo: more efficient TTY by reading whatever is available instead of one.
 *  This is implemented in C++ to avoid using the C runtime FILE subsystem.
 *  ToDo: a TypeScript version that would also be compatible with
 *  AssemblyScript
 */

/*c{

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

// Is it a TTY or a disk file?
static bool getline_is_tty = false;

// A saved char, needed when nulls are inserted after newlines
static int getline_safe_char = -1;

static void fast_getline_close( int fd ){
// Should be called by the entity that opened the fd and will close it
  // Ignore if not about the current file descriptor
  if( fd >= 0 && fd != getline_fd )return;
  // Reset the buffer
  getline_buf_length = 0;
  getline_buf_ptr = getline_buf;
  *getline_buf = 0;
  getline_fd = -1;
  getline_safe_char = -1;
  getline_is_tty = false;
}


static void fast_getline_open( int fd ){
// Should be called by the entity that opened the fd (and will close it)
  // Close the current file descriptor, if any
  fast_getline_close( getline_fd );
  getline_fd = fd;
  if( getline_fd < 0 )return;
  // Is it a TTY?
  #ifdef _WIN32
    // Windows version:
    getline_is_tty = GetFileType( (HANDLE) fd ) != FILE_TYPE_DISK;
  #else
    // Unix version:
    getline_is_tty = isatty( fd );
  #endif
}


static char* fast_getline_remainder(){
// Return whatever remains in the buffer, with \n and \0
  if( getline_buf_length == 0 )return NULL;
  // Add a \n if needed
  if( getline_buf_ptr[ getline_buf_length - 1 ] != '\n' ){
    getline_buf_ptr[ getline_buf_length ] = '\n';
    getline_buf_length++;
  }
  // Add a \0
  getline_buf_ptr[ getline_buf_length ] = 0;
  char* result = getline_buf_ptr;
  // Reset the buffer
  getline_buf_length = 0;
  getline_buf_ptr = getline_buf;
  getline_safe_char = -1;
  return result;
}


static char* fast_getline( int fd ){

  // The result
  char* result = NULL;

  // If not the same fd, flush the buffer
  if( fd != getline_fd ){
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
    // Reduce the remaining length, including the newline
    getline_buf_length -= ( nl - getline_buf_ptr ) + 1;
    // Move remaining ptr past the newline
    getline_buf_ptr = nl + 1;
    // Add a null to the end of the line but save the char first
    getline_safe_char = *getline_buf_ptr;
    *getline_buf_ptr = 0;
    // On next call, the saved char will be restored
    return result;
  }

  // No newline, refill the buffer

  // First move what remains to the front
  memmove( getline_buf, getline_buf_ptr, getline_buf_length );
  getline_buf_ptr = getline_buf;
  result = getline_buf;

  // Then try to fill the rest
  int space_to_fill = MAX_LINE_LENGTH - getline_buf_length;
  de&&mand( space_to_fill >= 0 );
  int more_length = 0;

  // Unless the buffer is full?
  if( space_to_fill == 0 ){
    // If so, it's a line that is too big, file is unfit to proceed
    fast_getline_close( getline_fd );
    return NULL;
  }

  // If this is a TTY then read one character at a time, until a newline or EOF
  if( getline_is_tty ){
    int nreads = 0;
    int count_more = 0;
    int attempted_size = 1;
    while( true ){
      // On Unix, try to read more than one character at a time
      #ifndef _WIN32
        nreads = ioctl( fd, FIONREAD, &attempted_size );
        if( nreads < 0 ){
          // Exit loop, propagating the error
          count_more = nreads;
          break;
        }
        // Read at least one characer, blocking
        if( attempted_size < 1 ){
          attempted_size = 1;
        }
        // Don't read more than the buffer can hold
        if( attempted_size > space_to_fill ){
          attempted_size = space_to_fill;
        }
      #endif
      nreads = read(
        fd,
        getline_buf + getline_buf_length + count_more,
        attempted_size
      );
      // On error, exit loop, propagating the error
      if( nreads < 0 ){
        count_more = nreads;
        break;
      }
      // Exit loop if EOF
      if( nreads == 0 )break;
      // Increase total number of characters read
      count_more += nreads;
      // Decrease space to fill
      space_to_fill -= nreads;
      de&&mand( space_to_fill >= 0 );
      // Exit loop if some newline is found
      if( getline_buf[ count_more - 1 ] == '\n' )break;
      // Don't overflow
      if( space_to_fill == 0 )break;
    }
    more_length = count_more;

  // If not a TTY, read as much as possible
  }else{
    more_length = read(
      fd,
      getline_buf_ptr + getline_buf_length,
      space_to_fill
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
    // Return what we have
    return result;
  }

  // There are more characters available now
  getline_buf_length += more_length;

  // Make sure new content is null terminated, it may help debugging
  getline_buf[ getline_buf_length ] = 0;

  // Retry, it should work this time, unless line is too big
  result = fast_getline( fd );
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
      /*}*/
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

    // xx(, xx{, xx[ and xx" are words of a special type.
    // so is xxx: when before a space or /xxx/yyy which is /xxx
    if( teq( toker_ch, "(" )
    ||  teq( toker_ch, '[' )
    ||  teq( toker_ch, '{' )
    ||  teq( toker_ch, '"' )
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
 *  set-literate - set the tokenizer to literate style
 */

function primitive_set_literate(){
  const val = pop_boolean();
  tokenizer_set_literate_style( val ? true : false );
}
primitive( "set-literate", primitive_set_literate );


/* ----------------------------------------------------------------------------
 *  eval
 *  This is the source code interpreter. It reads a text made of verbs and
 *  executes it.
 *  It detects a special verb that starts the definition of a new verb.
 *  That definition is made of next verbs that are either added to the
 *  new verb or sometime executed immediatly instead because they help to
 *  build the new verb.
 *  Once a new verb is defined, it can be executed by the machine code
 *  interpretor that can be found in the RUN() function.
 */

//const tag_block             = tag( "block"               );
const tag_run_method_by_name  = tag( "run-method-by-name"  );
const tag_run_method_by_tag   = tag( "run-method-by-tag"   );
const tag_local               = tag( "local"               );
const tag_set_local           = tag( "set-local"           );
const tag_data                = tag( "data"                );
const tag_set_data            = tag( "set-data"            );
const tag_object_get          = tag( "object-get"          );
const tag_object_set          = tag( "object-set"          );


/*
 *  integer-text? primitive
 */

const tag_is_integer_text = tag( "integer-text?" );

function is_integer( buf : ConstText ) : boolean {
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
  /*}*/
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


function text_to_integer( buf : ConstText ) : Value {
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
  /*ts{*/
    const parsed = parseInt( auto_buf );
    if( isNaN( parsed ) ){
      push_tag( tag_NaN );
    } else {
      push_integer( parsed );
      set_tos_name( tag_parse_integer );
    }
  /*}*/
  /*c{
    if( ! is_integer( auto_buf ) ){
      push_tag( tag_NaN );
    } else {
      push_integer( text_to_integer( auto_buf ) );
      set_tos_name( tag_parse_integer );
    }
  /*}*/
}
primitive( "parse-integer", primitive_parse_integer );


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


function mand_stacks_are_in_bounds() : boolean {
  return mand_tos_is_in_bounds() && mand_csp_is_in_bounds();
}


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

  // parse_type
  set( the_tmp_cell, type_integer, tag_type, parse_type );
  stack_push( parse_stack, the_tmp_cell );

  // parse_name
  set_text_cell( the_tmp_cell, parse_name );
  set_name( the_tmp_cell, tag_name );
  stack_push( parse_stack, the_tmp_cell );

  // parse_verb
  set( the_tmp_cell, type_integer, tag_verb, parse_verb );
  stack_push( parse_stack, the_tmp_cell );

  // parse_block_start
  set( the_tmp_cell, type_integer, tag_block_start, parse_block_start );
  stack_push( parse_stack, the_tmp_cell );

  // parse_line_no
  set( the_tmp_cell, type_integer, tag_line_no, token_line_no );
  stack_push( parse_stack, the_tmp_cell );

  // parse_column_no
  set( the_tmp_cell, type_integer, tag_column_no, token_column_no );
  stack_push( parse_stack, the_tmp_cell );
}


function pop_parse_state(){
// Restore the current parse context using the parse stack
  let c;

  // parse_column_no
  c = stack_pop( parse_stack );
  parse_column_no = eat_integer( c );

  // parse_line_no
  c = stack_pop( parse_stack );
  parse_line_no = eat_integer( c );

  // parse_block_start
  c = stack_pop( parse_stack );
  parse_block_start = eat_integer( c );

  // parse_verb
  c = stack_pop( parse_stack );
  parse_verb = eat_integer( c );

  // parse_name
  c = stack_pop( parse_stack );
  parse_name = cell_to_text( c );
  clear( c );

  // parse_type
  c = stack_pop( parse_stack );
  parse_type = eat_integer( c );

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
    de&&mand_eq( value_of( chk_def + len * ONE ), 0 );
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
    verbose_stack_de&&bug( S()+ "PUSH LITERAL\n" + stacks_dump() );
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
  const def = definition_of( code );

  // The last code is always a return, hence the - 1
  const def_len = definition_length( def ) - 1;

  // ToDo: don't inline the definition of "future" verbs, ie forward declared

  // Either inline the associated definition or add a code to reference it
  if( def_len <= 1 || is_inline_verb( code ) ){

    // ToDo: inlining a constant is not a good idea when it is actually
    // a global variable..., see the hack avoiding this in primitive_constant()
    stack_push_copies( parse_codes, def, def_len );

  }else{

    // Add a code to reference the definition
    set( the_tmp_cell, type_verb, code, def );
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
      + N( tag ) + " " + tag_to_text( tag )
    );

    // Remember in control stack what verb is beeing entered
    // ToDo: should use type_verb?
    // ToDo: optimize by returning to some "back-to-outer-interpreter"
    // This primitive would exit the inner interpreter and return to the
    // outer interpreter, which would then continue to execute the
    // next instruction. This would avoid the overhead of checking
    // against 0 whenever a "return" is executed. This optimization
    // requires using an exception to exit the inner interpreter.
    CSP += ONE;
    set( CSP, type_ip, tag, 0 );
    IP = definition_of( tag );
    de&&mand_neq( IP, 0 );

    // Check stacks
    // ToDo: grow them when needed?
    de&&mand( TOS < ACTOR_data_stack_limit );
    de&&mand( TOS >= ACTOR_data_stack );

    verbose_stack_de&&bug( S()
      + "Eval. Before immediate RUN of " + tag_to_text( tag )
      + " at IP " + C( IP )
      + "\n" + stacks_dump()
    );

    // ToDo: try{ ... } and "back-to-outer-interpreter" primitive
    RUN();

    de&&mand( TOS < ACTOR_data_stack_limit );
    de&&mand( TOS >= ACTOR_data_stack );
    verbose_stack_de&&bug( S()
      + "\nEval. After immediate RUN of "
      + tag_to_text( tag )
      + "\n" + stacks_dump()
    );

  // When adding to the definition of a new verb or block
  }else{

    eval_de&&bug( S()
      + "Eval. do_machine_code, compile "
      + N( tag ) + " " + tag_to_text( tag )
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
    name_of( stack_at( parse_codes, parse_block_start ) ),
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

function operand_X( v : ConstText ) : Text {
// remove first character, ex .a becomes a
  return tbut( v, 1 );
}


function operand__X( v : ConstText ) : Text {
// remove firts two characters
  return tbut( v, 2 );
}


function operand_X_( v : ConstText ) : Text {
// remove first and last characters
  return tmid( v, 1, -1 );
}


function operandX_( v : ConstText ) : Text {
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

function is_special_verb( val : ConstText ) : boolean {

  if( val == "<" )debugger;

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

  // xxx" is for smart text
  if( last_ch  == "\"" )return true;

  // xxx[ is for smart aggreagates, like lists, maps, etc
  if( last_ch  == "[" )return true;

  return false;

}


/*
 *  eval primitive
 */

function tok_match( t : Index, s : ConstText ) : boolean {
  if( token_type != t )return false;
  if( tneq( token_text, s ) )return false;
  return true;
}


function tok_word( s : ConstText ) : boolean {
  return tok_match( token_type_word, s );
}


function tok_type( t : Index ) : boolean {
  return token_type == t;
}


function tok( s : ConstText ) : boolean {
  return teq( token_text, s );
}


function parsing( node_type : Index ) : boolean {
  return parse_type == node_type;
}

/*
 *  eval - evaluate a source code text
 */

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

  // Name of verb for xxx( ... ), xxx{ ... }, xxx[ ... ] and xxx"..." calls
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

    // Skip less frequent case when possible, to avoid some useless tests
    if( !tok_type( token_type_word ) ){

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
        done = true;
        break;
      }

      // eof ? exit loop at end of the input stream
      if( tok_type( token_type_eof ) ){
        // ToDo: signal premature end of file
        if( ! parsing( parse_top_level ) ){
          bug( S()+ "Eval, premature end of file" );
          debugger;
        }
        done = true;
        break;
      }
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
      done = true;
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
      done = true;
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
    //   "call["     - after some xxx{ and until the closing ].
    //   "call""     - after some xxx" and until the closing ".
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
          if( parse_de || warn_de ){
            trace( S()+ "Parser. Undefined verb: " + token_text );
            if( parse_de ){
              breakpoint();
            }
          }
        }else{
          verb_id = tag( token_text );
        }
      }

    }

    // If existing verb, handle operators
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
      }else{
        is_operator = false;
      }

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
      // ToDo: quid of xxx[ and xxx" ?
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
          eval_do_integer_literal( definition_of( tag( auto_verb ) ) );
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
 *  trace - output text to console.log(), preserve TOS
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
 *  ascii-character - return one character text from TOS integer
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
  /*}*/
  set_text_cell( TOS, ch );
  set_tos_name( tag_ascii );
}
primitive( "ascii-character", primitive_ascii_character );


/*
 *  ascii-code - return ascii code of first character of TOS as text
 */

function primitive_ascii_code(){
  /**/ const code = cell_to_text( TOS ).charCodeAt( 0 );
  //c/ int code = cell_to_text( TOS ).at( 0 );
  clear( TOS );
  set( TOS, type_integer, code, tag_ascii );
}
primitive( "ascii-code", primitive_ascii_code );


/*
 *  now - return number of milliseconds since start
 */

const tag_now = tag( "now" );

/*c{
int int_now( void ){
  auto delta = milliseconds( now() - time_start );
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
 *  the-void - push a void cell
 */

function primitive_the_void(){
  PUSH();
}
primitive( "the-void", primitive_the_void );


/* -----------------------------------------------------------------------------
 *  A tool to visit the memory.
 *  It takes a pointer to a function as parameter and will call that function
 *  for each area in the memory, with information about the nature of the area.
 *  The function must return a boolean. If it returns true, the visitation
 *  stops and the function returns true. If it returns false, the visitation
 *  continues and the function returns false.
 *  To avoid monopolizing the CPU, the visitation is incremental. It does not
 *  visit the whole memory at once, but only a part of it.
 */

// Type for the visitor function, it takes the address of a cell, a tag that
// describes the nature of the area, and the size of the area in bytes. It
// returns a boolean, true to stop the visitation, false to continue.
/**/ type MemoryVisitFunction = ( Cell, Tag, Size ) => boolean;
//c/ typedef bool (*MemoryVisitFunction)( Cell, Tag, Size );

// The current visitor function
/**/ let memory_visit_function : MemoryVisitFunction = null;
//c/ static MemoryVisitFunction memory_visit_function       = null;

// The last visited cell
let memory_visit_last_cell = 0;

// The upper limit to visit, excluded
let memory_visit_limit = 0;

// How many cells are visited at once, default value
let memory_visit_default_increment = 1000;

// How many cells are visited at once, current value
let memory_visit_increment = 0;

// What is left for the current phase
let memory_visit_left = 0;

// The number of visited areas so far
let memory_visit_area_count = 0;

// The first void cell in a sequence of void cells
let memory_visit_void_start = -1;

// Never issue multiple /begin
let memory_visit_begin_count = 0;


function memory_visit_set_increment( i : Count ){
// Set the number of cells to visit at once
  memory_visit_increment = i;
  memory_visit_left = i;
}


function memory_visit_from( cell : Cell ){
// Start the visitation from a given cell
  if( cell < the_very_first_cell ){
    cell = the_very_first_cell;
  }
  memory_visit_last_cell = cell - 1 * ONE;
}


function memory_visit_to( cell : Cell ){
// Stop the visitation at a given cell, excluded
  if( cell > the_cell_limit ){
    cell = the_cell_limit;
  }
  memory_visit_limit = cell;
  if( memory_visit_last_cell >= memory_visit_limit ){
    memory_visit_last_cell = memory_visit_limit - 1 * ONE;
  }
}

function memory_visit_setup( f : MemoryVisitFunction ){
// Set the function to call for each area
  memory_visit_function = f;
  memory_visit_from( 0 );
  memory_visit_to( the_cell_limit );
  memory_visit_set_increment( memory_visit_default_increment );
  memory_visit_void_start  = -1;
  memory_visit_area_count  = 0;
  memory_visit_begin_count = 0;
}




const tag_begin              = tag( "begin"             );
const tag_end                = tag( "end"               );
const tag_first              = tag( "first"             );
const tag_last               = tag( "last"              );
const tag_free               = tag( "free"              );
const tag_busy               = tag( "busy"              );
const tag_cell               = tag( "cell"              );
const tag_rom                = tag( "rom"               );
//const tag_IP               = tag( "IP"                );
//const tag_TOS              = tag( "TOS"               );
//const tag_CSP              = tag( "CSP"               );
//const tag_data_stack       = tag( "data-stack"        );
const tag_data_stack_end     = tag( "data-stack-end"    );
//const tag_control_stack    = tag( "control-stack"     );
const tag_control_stack_end  = tag( "control-stack-end" );


function memory_visit_step() : boolean {
// Visit a small part of the memory, return true to stop the visitation

  // Done if there is no visitor function
  if( memory_visit_function == null )return true;

  // Done if no more credit to pursue the visitation
  if( memory_visit_left == 0 ){
    // Give some credit for the next phase
    memory_visit_left = memory_visit_increment;
    return false;
  }
  memory_visit_left = memory_visit_left - 1;

  // Get to next cell
  const cell = memory_visit_last_cell + 1 * ONE;

  // Don't cross the limit
  if( cell >= the_cell_limit ){
    memory_visit_function( memory_visit_last_cell, tag_end, 0 );
    // Done
    memory_visit_function = null;
    return true;
  }

  memory_visit_last_cell = cell;

  // Default size is size of a cell, ie 8 bytes for now
  let sz = size_of_cell;

  // Fire #begin if it is the first cell of the round
  if( memory_visit_left == memory_visit_increment - 1 ){
    memory_visit_begin_count = memory_visit_begin_count + 1;
    // Only the first time
    if( memory_visit_begin_count == 1 ){
      if( memory_visit_function( cell, tag_begin, 0 ) )return true;
    }
  }

  // Fire #first if it is the first cell
  if( cell == the_very_first_cell ){
    if( memory_visit_function( cell, tag_first, 0 ) )return true;
  }

  // Fire #last if it is the last cell
  if( cell == the_cell_limit - 1 * ONE ){
    if( memory_visit_function( cell, tag_last, 0 ) )return true;
  }

  alloc_de&&mand( cell < the_cell_limit );

  // Fire #IP if the is current instruction pointer
  if( cell == IP ){
    if( memory_visit_function( cell, tag_IP, sz ) )return true;
  }

  // Fire #tos if the is current top of stack
  if( cell == TOS ){
    if( memory_visit_function( cell, tag_TOS, sz ) )return true;
  }

  // Fire #csp if the is current control stack pointer
  if( cell == CSP ){
    if( memory_visit_function( cell, tag_CSP, sz ) )return true;
  }

  // Fire #data-stack if the is the base of the current data stack
  if( cell == ACTOR_data_stack ){
    if( memory_visit_function( cell, tag_data_stack, sz ) )return true;
  }

  // Fire #data-stack-end if the is last cell of the data stack
  if( cell == ACTOR_data_stack_limit - 1 * ONE ){
    if( memory_visit_function( cell, tag_data_stack_end, sz ) )return true;
  }

  // Fire #control-stack if the is the base of the current control stack
  if( cell == ACTOR_control_stack ){
    if( memory_visit_function( cell, tag_control_stack, sz ) )return true;
  }

  // Fire #control-stack-end if the is last cell of the control stack
  if( cell == ACTOR_control_stack_limit - 1 * ONE ){
    if( memory_visit_function( cell, tag_control_stack_end, sz ) )return true;
  }

  // Detect consecutive void cells
  if( info_of( cell ) == 0 && value_of( cell ) == 0 ){
    // Skip consecutive void cells
    if( memory_visit_void_start == -1 ){
      memory_visit_void_start = cell;
    }
    return false;
  }

  // Fire #void with the total size of consecutive void cells
  if( memory_visit_void_start != -1 ){
    sz = ( cell - memory_visit_void_start ) * size_of_cell;
    if( memory_visit_function(
      memory_visit_void_start,
      tag_void,
      sz
    ) ){
      memory_visit_void_start = -1;
      return true;
    }
    memory_visit_void_start = -1;
  }

  const potential_area = cell + 2 * ONE;

  if( potential_area < the_cell_limit && area_cell_is_area( potential_area ) ){

    sz = area_size( potential_area );

    // Fire #free if the cell is the start of a free area
    if( area_is_free( potential_area ) ){
      if( memory_visit_function( cell, tag_free, sz ) )return true;
    }

    // Fire #busy if the cell is the start of a busy area
    if( area_is_busy( potential_area ) ){
      if( memory_visit_function( cell, tag_busy, sz ) )return true;
    }

    // Skip the area
    const ncells = sz / size_of_cell;
    memory_visit_last_cell = cell + ( ncells - 1 ) * ONE;

  }else{

    // Fire #cell for all "normal" cells
    if( memory_visit_function( cell, tag_cell, sz ) )return true;

  }

  // Fire #end if it is the last cell for this round
  if( memory_visit_left == 0 ){
    // Decrease the begin counter
    memory_visit_begin_count = memory_visit_begin_count - 1;
    // Only the last time
    if( memory_visit_begin_count == 0 ){
      if( memory_visit_function( cell, tag_end, sz ) ){
        // Done
        memory_visit_function = null;
        return true;
      }
    }
    return false;
  }

  return false;

}


let cells_to_visit = 0;

function memory_visit_map_visitor( c : Cell, tag : Tag, sz : Size ) : boolean {
// Visitor function for memory_visit_map()
  // Skip plain normal cells, unless configured to keep some of them
  if( tag == tag_cell ){
    if( cells_to_visit <= 0 )return false;
    cells_to_visit--;
  }
  const auto_dump_text = dump( c );
  if( sz <= size_of_cell ){
    trace( S()+ C( c ) + " " + tag_to_dump_text( tag ) + " " + auto_dump_text );
    return false;
  }
  const ncells = sz / size_of_cell;
  trace( S()+
    C( c ) + " /" + tag_to_dump_text( tag )
    + " [" + N( ncells ) + "] " + auto_dump_text
  );
  return false;
}


function memory_visit_map(){
// Visit the whole memory and fire the visitor function for each cell
  memory_visit_setup( memory_visit_map_visitor );
  memory_visit_to( the_cell_limit );
  cells_to_visit = 10000;
  while( true ){
    if( memory_visit_step() )break;
  }
}


/*
 *  memory-visit - get a view of the memory
 */

function primitive_memory_visit(){
  memory_visit_map();
}
primitive( "memory-visit", primitive_memory_visit );


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
//c/ static Text processor( TxtC json_state, TxtC json_event, TxtC source_code ){

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
 *  TypeScript version of bootstrap and read-eval-print loop
 */


/*
 *  export functions for those who creates javascript primitives
 */

/*ts{*/

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
  type: type_of,
  name: name_of,
  value: value_of,
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
function signal( event : TxtC ){
  // ToDo: push event object onto the data stack
  // ToDo: run_verb( "signal" );
}

/**/ function on( event : TxtC, handler : ( e : ConstText ) => void ){
//c/ void     on( TxtC event,  void (*handler)( TxtC e ) ){
// ToDo: register handler for event in the event handler table.
// Possible events are: "exit", "reset" & "SIGINT"
// ToDo: on micro-controler hardware it could register interupt handlers?
// That would probably require some queueing mechanism and some C coded
// low level handlers when time is critical.
}

/*ts{*/

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

/*}*/


/* --------------------------------------------------------------------------
 *  Bootstraping and smoke test.
 */

/*ts{*/

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


/* -----------------------------------------------------------------------------
 *  Load the standard library and run the smoke test if appropriate.
 */

function bootstrap(){
  eval_file( "bootstrap.nox" );
  eval_file( "forth.nox" );
  if( de ){
    eval_file( "test/smoke.nox" );
    primitive_memory_visit();
  }
}


/* -----------------------------------------------------------------------------
 *  Almost ready, initialize some more globals and run the bootstrap.
 */

/*c{

static void init_globals(){

  // In C++ calls to register primitives using primitive() cannot be done
  // until now, as a result the definition of the verbs that call those
  // is not available until now. This is not a problem in Javascript.
  // See code in build_targets() where all calls to primitive() are
  // collected and then inserted here in the generated C++ source file.
  ALL_PRIMITIVE_DECLARATIONS

}*/

  return_without_parameters_definition
  = definition_of( tag_return_without_parameters );
  until_checker_definition
  = definition_of( tag_until_checker );
  while_checker_definition
  = definition_of( tag_while_checker );
  return_without_it_definition
  = definition_of( tag_return_without_it );
  assert_checker_definition
  = definition_of( tag_assert_checker );
  return_without_locals_definition
  = definition_of( tag_return_without_locals );

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

/*ts{*/

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
  I.evaluate( "( . writes TOS on stdout ) : .  out ;" );

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

static void TODO( const char* message ){
  Text buf( "TODO: " );
  buf += message;
  buf += "\n";
  write( 2, buf.c_str(), buf.length() );
}

// static void add_history( TxtC line ){
//  TODO( "add_history: free the history when the program exits" );
// }


static int repl(){
  char* line;
  while( true ){
    trace( "ok " );
    // Read line from stdin
    line = fast_getline( 0 );
    if( !line ){
      break;
    }
    trace( evaluate( S() + "~~\n" + line ).c_str() );
  }
  return 0;
}


int main( int argc, char* argv[] ){
  init_globals();
  // ToDo: fill some global ENV object
  // ToDo: ? push ENV object & arguments onto the data stack
  // Display some speed info
  auto duration_to_start = int_now();
  auto buf = S()
  + N( duration_to_start ) + " ms and "
  + N( int( ceil( ( instructions_total / duration_to_start ) / 1000 ) ) )
  + " Mips to start REPL";
  trace( buf.c_str() );
  return repl();
}

}*/

// That's all Folks!
