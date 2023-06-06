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
 *  march    18 2023 by jhr, almost 20Kloc, 220 Mips, Cheerp C++ (failed)
 *  may       7 2023 by jhr, 24Kloc, start of l9 kernel
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
 *  Some constant definitions
 */

/// 0: no debug, 1: some debug, 2: more debug, etc
const INOX_DEBUG_LEVEL = 1;

/// The initial size of the flat memory where the Inox interpreter will run
// ToDo: make the size configurable at run time ?
const INOX_HEAP_SIZE = 64 * 1024; // Minimum is 24 bytes

/// The initital length of the symbol table
const INOX_SYMBOL_TABLE_SIZE = 2048;

/// Rely on malloc/free or use the custom memory manager?
//c/ #define INOX_USE_MALLOC 1


/* ----------------------------------------------------------------------------
 *  Literate programming
 *  See https://en.wikipedia.org/wiki/Literate_programming

To some extend this source file is a literate program. That does not mean
that it is a program that is easy to read and understand, it just mean that
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
 *  This a OneBigSourceFile, ie a single source file that contains all the code.
 *  I am using the Visual Studio Code editor. It's a very good editor, but
 *  I need to run it using "code --disable-renderer-accessibility" because
 *  it gets slow when the file is too big.
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
  // HANDLE is not supposed to be casted to int, but it works
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
// It's still available on Linux, but it is not portable. The chrono library
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
// It's a 29 bits index that needs to be << 3 shifted to get a byte pointer
/**/ type    Cell = i32;
//c/ #define Cell   i32

// Address of a dynamically allocated cell, a subtype of Cell
/**/ type Area    = i32;
//c/ #define Area   i32

// Smallest entities at an address in memory
/**/ type    InoxWord = i32;
//c/ #define InoxWord   i32

// Index in rather small arrays usually, usually positive
/**/ type    Index = i32;
//c/ #define Index   i32

// Integer is a 32 bits signed integer
/**/ type    Integer = i32;
//c/ #define Integer   i32

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

// Payload of cell
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

// Synonym for Name
/**/ type    Tag = i32;
//c/ #define Tag   i32

// Shorthand for string, 4 vs 6 letters
/**/ type    Text    = string;
/**/ type    MutText = string;

// In C++, we define a custom string class, LeanString
//c/ class LeanString;
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
 *  modified, and read by other people who are as incompetent as she/he is.
 *
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
import { parse } from 'path';

// In C++, custom assert() macro that avoids using any external library
/*c{

  #define true  1
  #define false 0

  #ifndef INOX_ASSERT_MAX_LENGTH
    #define INOX_ASSERT_MAX_LENGTH 512
  #endif

  static char assert_msg_buffer[ INOX_ASSERT_MAX_LENGTH + 80 ];

  // Forward
  static bool breakpoint( void );

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

  #ifdef INOX_DEBUG
    #define legacy_de de
  #else
    #define legacy_de false
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
 *  This is not as efficient as a macro, but it is portable and it makes
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

#if ! defined( INOX_EVAL_NDE ) && ! defined( INOX_EVAL_DE )
  #define INOX_EVAL_DE
  #undef  INOX_EVAL_NDE
#endif
#ifdef INOX_EVAL_DE
  #undef INOX_EVAL_NDE
#endif

#if ! defined( INOX_RUN_NDE ) && ! defined( INOX_RUN_DE )
  #define INOX_RUN_DE
  #undef  INOX_RUN_NDE
#endif
#ifdef INOX_RUN_DE
  #undef INOX_RUN_NDE
#endif

#if ! defined( INOX_TOKEN_NDE ) && ! defined( INOX_TOKEN_DE )
  #define INOX_TOKEN_DE
  #undef  INOX_TOKEN_NDE
#endif
#ifdef INOX_TOKEN_DE
  #undef INOX_TOKEN_NDE
#endif

#if ! defined( INOX_PARSE_NDE ) && ! defined( INOX_PARSE_DE )
  #define INOX_PARSE_DE
  #undef  INOX_PARSE_NDE
#endif
#ifdef INOX_PARSE_DE
  #undef INOX_PARSE_NDE
#endif

#if ! defined( INOX_STACK_NDE ) && ! defined( INOX_STACK_DE )
  #define INOX_STACK_DE
  #undef  INOX_STACK_NDE
#endif
#ifdef INOX_STACK_DE
  #undef INOX_STACK_NDE
#endif

#if ! defined( INOX_BLABLA_NDE ) && ! defined( INOX_BLABLA_DE )
  #define INOX_BLABLA_DE
  #undef  INOX_BLABLA_NDE
#endif
#ifdef INOX_BLABLA_DE
  #undef INOX_BLABLA_NDE
#endif

#if ! defined( INOX_STEP_NDE ) && ! defined( INOX_STEP_DE )
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
 *  When a 'de' controlled check does not bomb long enough, it is time to
 *  turn it into a 'legacy_de' controlled check. This way, the interpreter does
 *  not slow down too much because of accumulated checks. And it is still
 *  possible to turn the legacy checks on when needed, when some nasty bug
 *  bites again.
 */

/**/ let legacy_de = false;
/*c{
  // In "fast" mode, 'legacy_de' flag cannot be activated at runtime
  #ifdef INOX_FAST
    #define legacy_de false
  #else
    #ifndef legacy_de
      static bool legacy_de = false;
    #endif
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
 *  'info_de' is about debug info injection in compiled code.
 *  It may be disabled in production if the source code is trusted.
 *  Usefull for debugging. Code without debug info runs faster.
 */

/**/ let info_de = true;
/*c{
  // In "fast" mode, 'info_de' flag cannot be activated at runtime
  #ifdef INOX_INFO_NDE
    #define info_de false
  #else
    static bool info_de = true;
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

/*
 *  Global flag to capture all traces message in a buffer
 *  See log primitive to enable/disable/query/flush trace captures.
 */

let trace_capture_enabled = false;


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
    #ifndef info_de
      info_de = true;
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
    #ifndef info_de
      info_de = false;
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
      // Case where only type checking & stack checking are still there
      normal_debug();
    break;

    case 2:
      // Next commes the case where more debugging is enabled
      debug();
      /**/ alloc_de = false;
      /**/ token_de = false;
      /**/ parse_de = false;
      /*c{
        #ifndef alloc_de
          alloc_de = false;
        #endif
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
      /**/ legacy_de = true;
      /*c{
        #ifndef legacy_de
          legacy_de = true;
        #endif
      }*/
      level = 5;
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
  typedef bool (*MemoryVisitFunction)( Cell, Tag, Size );
  #define set( c, t, n, v )  init_cell( c, v, pack( t, n ) )
  // See built_targets() about forward declarations automatic generation
  // ALL_C_FUNCTION_ DECLARATIONS
static void debug( void );
static void normal_debug( void );
static void no_debug_at_all( void );
static Index init_debug_level(  Index level  );
static boolean breakpoint( void );
static Index is_little_endian( void );
static Index check_endianess( void );
static boolean mand_cell_in_range(  Cell c  );
static void set_value(  Cell c, Value v  );
static void set_info(  Cell c, Info i   );
static Value value_of(  Cell c  );
static Info info_of(  Cell c  );
static void reset(  Cell c  );
static void reset_value(  Cell c  );
static void reset_info(  Cell c  );
static void init_cell(  Cell c, Value v, Info i  );
static void init_copy_cell(  Cell dst, Cell src  );
static void set_type(  Cell c, Type t  );
static void set_name(  Cell c, Tag n  );
static Cell lean_str_init_empty( void );
static boolean lean_str_is_empty(  Area area  );
static Length lean_aligned_cell_length(  Length len  );
static Area leat_str_header(  Area area  );
static boolean lean_str_is_valid(  Area area  );
static Area lean_str_allocate_cells_for_bytes(  Size sz  );
static void lean_str_lock(  Area area  );
static void lean_str_free(  Area area  );
static Value lean_str_unchecked_byte_at(  Cell cell, Index index  );
static Value lean_str_byte_at(  Area area, Index index  );
static void lean_str_byte_at_put(  Cell area, Index index, Value val  );
static void lean_str_byte_at_from(  Area dst, Index d_i, Area src, Index s_i  );
static Length lean_str_length(  Area area  );
static Area lean_str_new_from_native(  TxtC str  );
static TxtC lean_str_as_native(  Area area  );
static boolean lean_str_eq(  Area area1, Area area2  );
static Value lean_str_cmp(  Cell cell1, Cell cell2  );
static Area lean_str_new_from_strcat(  Area area1, Area area2  );
static Value lean_str_index(  Cell target, Cell pattern  );
static Value lean_str_rindex(  Cell target, Cell pattern  );
static Cell lean_substr(  Cell str, Value start, Value len  );
static Text C(  Cell c  );
static Text tat(  Text t, Index pos  );
static Index tidx(  ConstText s, ConstText sub  );
static Index tidxr(  ConstText s, ConstText sub  );
static boolean tpre(  ConstText pre, ConstText txt  );
static boolean tsuf(  ConstText suf, ConstText txt  );
static boolean mand_eq(  i32 a, i32 b  );
static boolean mand_neq(  i32 a, i32 b  );
static Index init_cell_allocator( void );
static void grow_memory(  Size sz  );
static boolean mand_list_cell(  Cell c  );
static Cell next(  Cell c  );
static void set_next_cell(  Cell c, Cell nxt  );
static Cell allocate_cells(  Count n  );
static Cell allocate_cell( void );
static void compact_cells_free( void );
static void cell_free(  Cell c  );
static void cells_free(  Cell c, Count n  );
static Index init_area_allocator( void );
static Cell header_of_area(  Area area  );
static Area area_from_header(  Cell header  );
static Value area_ref_count(  Area area  );
static void area_turn_busy(  Area area, Tag klass, Size sz  );
static void area_turn_free(  Area area, Area next_area  );
static void area_init_busy(  Area area, Tag klass, Count size  );
static boolean area_is_busy(  Area area  );
static boolean area_is_free(  Area area  );
static boolean area_cell_is_area(  Cell cell  );
static Area area_next(  Area area  );
static void area_set_next(  Area area, Area nxt  );
static void area_set_ref_count(  Area area, Value v  );
static Size area_size(  Area area  );
static Length area_length(  Area area  );
static Size area_payload_size(  Area area  );
static void area_set_size(  Area area, Size sz  );
static Size area_align_size(  Size s  );
static Count area_free_small_areas( void );
static Count area_garbage_collector( void );
static void area_garbage_collector_all( void );
static Area allocate_area(  Tag klass , Size sz  );
static Tag area_tag(  Area area  );
static Area resize_area(  Area area, Size sz  );
static void area_free(  Area area  );
static void area_lock(  Area area  );
static boolean area_is_shared(  Area area  );
static boolean area_is_safe(  Cell area  );
static void decrement_object_ref_count(  Area area  );
static void area_test_suite( void );
static boolean mand_empty_cell(  Cell c  );
static void clear_destination(  Cell c  );
static void copy_cell(  Cell source, Cell destination  );
static void move_cell(  Cell source, Cell destination  );
static void move_cells(  Cell source, Cell target, Length length  );
static void raw_move_cell(  Cell source, Cell destination  );
static void raw_copy_cell(  Cell source, Cell destination  );
static void reset_cell_value(  Cell c  );
static void clear_unshared_area(  Area area  );
static void clear(  Cell c  );
static void clear_value(  Cell c  );
static Index init_symbols( void );
static void upgrade_symbols( void );
static Text tag_as_text(  Tag t  );
static Text symbol_as_text(  Cell c  );
static Index symbol_lookup(  TxtC name  );
static Index register_symbol(  TxtC name  );
static void register_primitive(  Tag t, Primitive f  );
static void register_definition(  Tag t, Cell c  );
static Primitive get_primitive(  Tag t  );
static Cell get_definition(  Tag t  );
static boolean definition_exists(  Tag t  );
static Cell stack_allocate(  Length len  );
static Cell stack_preallocate(  Length len  );
static void stack_clear(  Area stk  );
static void stack_free(  Area stk  );
static Length stack_capacity(  Area stk  );
static Length stack_length(  Area stk  );
static boolean stack_is_empty(  Area stk  );
static boolean stack_is_not_empty(  Area stk  );
static void stack_set_length(  Area stk, Length len  );
static void stack_push(  Area stk, Cell c  );
static void stack_pushes(  Area stk, Cell c, Length len  );
static void stack_push_copy(  Area stk, Cell c  );
static void stack_push_copies(  Area stk, Cell c, Length len  );
static Cell stack_pop(  Area stk  );
static Cell stack_pop_nice(  Area stk  );
static Cell stack_peek(  Area stk  );
static Cell stack_dup(  Area stk  );
static Cell stack_at(  Area stk, Index i  );
static void stack_put(  Area stk, Index i, Cell src  );
static void stack_put_copy(  Area stk, Index i, Cell src  );
static Text stack_dump(  Area stk  );
static Text stack_split_dump(  Area stk, Index nth  );
static Cell stack_lookup_by_name(  Area stk, ConstText n  );
static Cell stack_lookup_by_tag(  Area stk, Tag tag  );
static void stack_update_by_name(  Area stk, ConstText n  );
static void stack_update_by_value(  Area stk, Cell c  );
static void stack_update_by_tag(  Area stk, Tag tag  );
static boolean stack_contains_cell(  Area stk, Cell c  );
static boolean stack_contains_name(  Area stk, ConstText n  );
static boolean stack_contains_tag(  Area stk, Tag tag  );
static Cell stack_resize(  Area stk, Length len  );
static Cell stack_rebase(  Area stk  );
static boolean stack_is_extended(  Area stk  );
static void stack_extend(  Area stk, Length len  );
static void set_boolean_cell(  Cell c, Value v  );
static Tag tag(  TxtC tag  );
static boolean tag_exists(  TxtC n  );
static boolean tag_is_valid(  Tag id  );
static void set_tag_cell(  Cell c, Tag n  );
static void set_verb_cell(  Cell c, Tag n  );
static void set_integer_cell(  Cell c, Value v  );
static boolean is_an_integer_cell(  Cell c  );
static Value cell_integer(  Cell c  );
static void set_float_cell(  Cell c, Float v  );
static boolean is_a_float_cell(  Cell c  );
static Float cell_float(  Cell c  );
static void set_reference_cell(  Cell c, Cell v  );
static Value cell_reference(  Cell c  );
static void set_text_cell(  Cell c, ConstText txt  );
static void text_free(  Area oid  );
static Index init_the_empty_text_cell( void );
static Index lean_string_test( void );
static Index test_text( void );
static void object_free(  Area area  );
static Index make_proxy(  any object  );
static void set_proxy_cell(  Cell c, Area area  );
static void proxy_free(  Area proxy  );
static any proxied_object_by_id(  Area id  );
static any cell_proxied_object(  Area c  );
static Text proxy_as_text(  Area area  );
static Cell init_default_verb_value( void );
static Cell init_default_verb_definition( void );
static Cell find_definition(  Tag verb_tag  );
static boolean verb_exists(  TxtC n  );
static Cell find_definition_by_name(  TxtC n  );
static Cell definition_of(  Index id   );
static Cell definition_by_name(  ConstText n  );
static boolean mand_definition(  Cell def  );
static Index definition_length(  Cell def  );
static void set_definition_length(  Cell def, Count length  );
static void register_method_definition(  Tag verb_tag, Cell def  );
static void set_verb_flag(  InoxWord id, Value flag  );
static Index test_verb_flag(  InoxWord id, Value flag  );
static void set_verb_immediate_flag(  Index id  );
static Index is_immediate_verb(  Index id  );
static void set_verb_hidden_flag(  Index id  );
static Index is_hidden_verb(  Index id  );
static void set_verb_operator_flag(  Index id  );
static Index is_operator_verb(  Index id  );
static void set_verb_block_flag(  Index id  );
static boolean is_an_inline_block_cell(  Cell c  );
static boolean is_block_ip(  Cell ip  );
static void set_inline_verb_flag(  Index id  );
static Index is_inline_verb(  Index id  );
static void set_verb_primitive_flag(  Index id  );
static Index is_primitive_verb(  Index id  );
static boolean is_a_reference_type(  Type t  );
static boolean is_sharable(  Cell c  );
static boolean mand_type(  Type actual, Type expected  );
static boolean mand_name(  Index actual, Index expected  );
static boolean mand_cell_type(  Cell c, Type type_id  );
static boolean mand_tag(  Cell c  );
static boolean mand_integer(  Cell c  );
static boolean mand_boolean(  Cell c  );
static boolean mand_verb(  Cell c  );
static boolean mand_block(  Cell c  );
static boolean mand_cell_name(  Cell c, Tag n  );
static boolean mand_void_cell(  Cell c  );
static boolean mand_boolean_cell(  Cell c  );
static boolean mand_tag_cell(  Cell cell  );
static boolean mand_reference_cell(  Cell c  );
static boolean mand_text_cell(  Cell cell  );
static boolean mand_verb_cell(  Cell c  );
static Index eat_raw_value(  Cell c  );
static Index get_tag(  Cell c  );
static Index get_integer(  Cell c  );
static Tag eat_tag(  Cell c  );
static Index eat_integer(  Cell c  );
static Index eat_boolean(  Cell c  );
static Index eat_value(  Cell c  );
static Value pop_raw_value( void );
static Value pop_value( void );
static Cell pop_block( void );
static Tag pop_tag( void );
static Value pop_integer( void );
static Index pop_boolean( void );
static Tag pop_verb( void );
static Index get_boolean(  Cell c  );
static boolean mand_reference(  Cell c  );
static Cell pop_reference( void );
static Cell eat_reference(  Cell c  );
static Cell reference_of(  Cell c  );
static Text pop_as_text( void );
static Cell eat_ip(  Cell c  );
static void push_text(  ConstText t  );
static void push_tag(  Tag t  );
static void push_verb(  Tag t  );
static void push_integer(  Index i  );
static void push_boolean(  boolean b  );
static void push_true( void );
static void push_false( void );
static void push_proxy(  Index proxy  );
static void push_reference(  Cell c  );
static void defer(  Tag name, Cell def  );
static void call(  Tag name, Cell def  );
static void memory_dump( void );
static boolean data_stack_is_empty( void );
static boolean mand_actor(  Cell actor  );
static Cell make_actor(  Cell ip  );
static void actor_save_context( void );
static void actor_restore_context(  Cell actor  );
static Index init_root_actor( void );
static boolean FATAL(  TxtC message  );
static Primitive primitive_by_tag(  Index id  );
static boolean primitive_exists(  Tag n  );
static void set_return_cell(  Cell c  );
static Tag primitive(  TxtC n, Primitive fn  );
static void immediate_primitive(  TxtC n, Primitive fn  );
static void operator_primitive(  TxtC n, Primitive fn  );
static void trace_context(  TxtC msg  );
static boolean is_a_void_cell(  Cell c  );
static boolean is_a_boolean_cell(  Cell c  );
static boolean is_a_tag_cell(  Cell c  );
static boolean is_a_verb_cell(  Cell c  );
static boolean is_a_text_cell(  Cell c  );
static boolean is_a_reference_cell(  Cell c  );
static boolean is_a_proxy_cell(  Cell c  );
static boolean is_a_flow_cell(  Cell c  );
static boolean is_a_list_cell(  Cell c  );
static boolean is_a_range_cell(  Cell c  );
static boolean is_a_box_cell(  Cell c  );
static Text HEX(  Value n  );
static Text text_quote(  TxtC txt  );
static Value checked_integer_from_text(  TxtC txt  );
static Value checked_integer_from_hex_text(  TxtC txt  );
static Value checked_integer_from_octal_text(  TxtC txt  );
static Value checked_integer_from_binary_text(  TxtC txt  );
static Text text_unquote(  TxtC txt  );
static Text text_pad(  TxtC txt, Count pad_len  );
static Text text_trim(  TxtC txt  );
static boolean proxy_is_safe(  Cell proxy  );
static boolean reference_is_safe(  Cell a  );
static boolean cell_looks_safe(  Cell c  );
static void new_bound_range(  Cell c, Index type, Value to  );
static void range_set_type(  Cell c, Index type  );
static Index range_get_type(  Cell c  );
static void range_set_low(  Cell c, Index low  );
static Index range_get_low(  Cell c  );
static void range_set_high(  Cell c, Index high  );
static Index range_get_high(  Cell c  );
static void range_set_binding(  Cell c, Value binding  );
static Value range_get_binding(  Cell c  );
static Length range_length(  Cell c  );
static void range_free(  Cell c  );
static boolean range_is_bound(  Cell c  );
static boolean range_is_free(  Cell c  );
static void range_textify_into(  Cell object, Cell dest  );
static boolean is_a_tag_singleton(  Cell c  );
static boolean cell_is_a_block(  Cell c  );
static boolean is_a_verb_block(  Cell c  );
static Text block_dump(  Cell ip  );
static Text tag_as_dump_text(  Value tag  );
static Text dump(  Cell c  );
static Text short_dump(  Cell c  );
static Text stacks_dump( void );
static Text type_as_text(  Index type_id  );
static Tag tag_of_type(  Type type_id  );
static Type tag_to_type(  Tag tag  );
static Type type_name_to_type(  ConstText n  );
static Tag cell_class_tag(  Cell c  );
static Cell lookup_sentinel(  Cell csp, Tag tag  );
static void push_float(  Float f  );
static Float pop_float( void );
static Text float_as_text(  Float f  );
static Text extract_line_no(  Text lines, Index line_no  );
static boolean is_empty_text_cell(  Cell c  );
static Text inox_machine_code_cell_as_text(  Cell c  );
static Text verb_flags_dump(  i32 flags  );
static Text definition_as_text(  Cell def  );
static Text text_of_verb_definition(  Index id  );
static boolean is_block(  Cell c  );
static Count object_length(  Cell area  );
static void set_box(  Cell box_cell, Cell value_cell  );
static void box_free(  Area box_cell  );
static void primive_box( void );
static void reference_textify(  Cell c  );
static void cell_textify(  Cell c  );
static Text cell_as_text(  Cell c  );
static Cell push( void );
static Cell pop( void );
static void run( void );
static Cell make_style(  TxtC style  );
static Cell aliases_by_style(  TxtC style  );
static void set_alias_style(  TxtC style  );
static void define_alias(  TxtC style, TxtC alias, TxtC new_text  );
static Text alias(  TxtC a  );
static void run_verb(  Index verb_id  );
static Count block_length(  Cell ip  );
static Index block_flags(  Index ip  );
static Text token_type_as_text(  Index type  );
static Tag tag_for_token_type(  Index type  );
static Index token_tag_to_type(  Tag t  );
static void set_comment_multi_line(  TxtC begin, TxtC end  );
static void set_comment_mono_line(  TxtC begin  );
static void set_style(  TxtC new_style  );
static void tokenizer_set_literate_style(  boolean is_it  );
static void tokenizer_restart(  TxtC source  );
static Text tokenizer_next_character( void );
static void unget_token(  Index t, ConstText s  );
static boolean ch_is_space(  ConstText ch  );
static boolean ch_is_digit(  TxtC ch  );
static boolean ch_is_eol(  ConstText ch  );
static Text extract_line(  TxtC txt, Index ii, Text mark  );
static boolean ch_is_limit(  TxtC ch, TxtC next_ch  );
static void refill_next(  Index ii  );
static Text handle_literate_style(  TxtC buf  );
static void process_whitespaces( void );
static void process_base_state( void );
static void process_comment_state( void );
static void process_text_state( void );
static boolean token_eat( void );
static void process_word_state( void );
static void detect_infinite_loop( void );
static void next_token( void );
static void test_tokcol(  Index typ, TxtC val, Index col  );
static void test_token(  Index typ, TxtC val  );
static Index test_tokenizer( void );
static boolean is_integer(  ConstText buf  );
static Value integer_from_text(  ConstText buf  );
static boolean mand_tos_is_in_bounds( void );
static boolean mand_csp_is_in_bounds( void );
static boolean mand_stacks_are_in_bounds( void );
static Text parse_type_as_text(  Index type  );
static Tag parse_type_as_tag(  Index type  );
static Index parse_tag_to_type(  Tag tag  );
static boolean bug_parse_levels(  TxtC title  );
static void push_parse_state( void );
static void pop_parse_state( void );
static void parse_enter(  Index type, TxtC name  );
static void parse_leave( void );
static void eval_definition_begin( void );
static boolean eval_is_compiling( void );
static void eval_definition_end( void );
static Text debug_info_as_text(  u32 debug_info  );
static boolean eval_is_expecting_the_verb_name( void );
static void add_debug_info( void );
static void eval_do_literal( void );
static void eval_do_text_literal(  TxtC t  );
static void eval_do_tag_literal(  TxtC t  );
static void eval_do_verb_literal(  TxtC t  );
static void eval_do_integer_literal(  Value i  );
static void add_machine_code(  Tag code  );
static void eval_do_machine_code(  Name tag  );
static void eval_quote_next_token( void );
static void eval_block_begin(  TxtC verb  );
static void eval_block_end( void );
static Text operand_X(  ConstText v  );
static Text operand__X(  ConstText v  );
static Text operand_X_(  ConstText v  );
static Text operandX_(  ConstText v  );
static boolean is_special_verb(  ConstText val  );
static boolean tok_match(  Index t, ConstText s  );
static boolean tok_word(  ConstText s  );
static boolean tok_type(  Index t  );
static boolean tok(  ConstText s  );
static boolean parsing(  Index node_type  );
static Index init_alias( void );
static void memory_visit_set_increment(  Count i  );
static void memory_visit_from(  Cell cell  );
static void memory_visit_to(  Cell cell  );
static void memory_visit_setup(  MemoryVisitFunction f  );
static boolean memory_visit_step( void );
static boolean memory_visit_map_visitor(  Cell c, Tag tag, Size sz  );
static void memory_visit_map( void );
static Text evaluate(  TxtC source_code  );
static void signal(  TxtC event  );
static void eval_file(  TxtC name  );
static void bootstrap( void );

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

// A few global variables need to be initialized soon
// That's mainly for debugging purposes
// They are documented better close to where they are used
let all_symbol_cells = 0;
let all_symbol_cells_length = 0;


/* -----------------------------------------------------------------------------
 *  logging/tracing
 */

// Faster access to console.log
/**/ const console_log = console.log;

/*
 *  Global flag to filter out all console.log until one needs them.
 *  See log primitive to enable/disable traces.
 */

/**/  let     bug = ! can_log ? trace : console_log;
//c/ #define  bug( a_message ) ( trace( a_message ) )


/*
 *  trace() is the default trace function. It's a no-op if can_log is false.
 *  It's a wrapper around console.log() if can_log is true.
 *  In C++, console_log() uses write()
 */

/**/ function trace( msg ) : boolean {
/**/    // de&&bug( a_message ) to log a message using console.log()
/**/    if( ! can_log ){
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
  if( ! can_log )return true;
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

function breakpoint() : boolean {
  debugger;
  if( bootstrapping )return true;
  trace_context( "" );
  debugger;
  return true;
}


/* ----------------------------------------------------------------------------
 *  'mand' is short for "demand" or "mandatory". It's functions that check
 *  if some condition is true. If it is not, they raise an exception. This
 *  implements assertions checking.
 *  There are various flavors of mand() to check various types of conditions.
 */

/*ts{*/

let traced_file   = 0;
let traced_line   = -1;
let traced_column = -1;

let mand_reenter_level = 0;

function mand( b : boolean ) : boolean {
  if( b )return true;
  mand_reenter_level++;
  if( mand_reenter_level > 1 ){
    mand_reenter_level--;
    bug( "Assert failure" );
    return true;
  }
  bug( "Assert failure" );
  breakpoint();
  mand_reenter_level--;
  assert( b );
  return true;
}


function mand2( b : boolean, m : string ) : boolean {
  if( b )return true;
  mand_reenter_level++;
  if( mand_reenter_level > 1 ){
    mand_reenter_level--;
    bug( "Assert failure: " + m );
    return true;
  }
  const auto_ = "Assert failure: " + m
  + " at " + tag_as_text( traced_file )
  + ":" + traced_line
  + ":" + traced_column;
  bug( auto_ );
  breakpoint();
  mand_reenter_level--;
  assert( b, auto_ );
  return true;
}

/*}*/

/*c{

  #define mand(     b    )    ( assert(  b    )       )
  #define mand2(    b, m )    ( assert2( b, m )       )

  // Hack to avoid a strange recursion
  static bool mand2_c_str( bool condition, char* msg ){
    return mand2( condition, msg );
  }

}*/


/* -----------------------------------------------------------------------------
 *  First, make it work in the javascript machine, it is the portable scheme.
 *  When compiled using AssemblyScript some changes will be required.
 */

/**/ de&&bug( "Inox is starting." );


/* -----------------------------------------------------------------------------
 *  Endianess. Sometimes, rarely, code depends on the order of bytes in memory.
 *  It is the case for the run() function that must be highly optimized.
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

    assert( ! is_little_endian || highest_byte_position_in_32 == 3 );
    assert(   is_little_endian || highest_byte_position_in_32 == 0 );
    assert( ! is_little_endian || highest_byte_position_in_64 == 7 );
    assert(   is_little_endian || highest_byte_position_in_64 == 0 );

    // Funny fact: when is_little_endian, at the end there is, guess what?
    // ... the highest byte. So it does not end little, it ends big.
    // That's rather confusing, but it is the way it is.

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

// 8 bytes, 64 bits
const size_of_word = 8;

// 4 bytes, 32 bits
const size_of_value = 4;

/**/ const   size_of_cell =   2 * size_of_value;
//c/ #define size_of_cell   ( 2 * size_of_value )

// Cell addresses to byte pointers and vice versa, aligned on cell boundaries
/**/ function to_cell( a_ptr : number  ) : Cell   {  return a_ptr    >> 3;  }
//c/ #define  to_cell( a_ptr )         (  (Cell)  ( ( (u32) a_ptr )  >> 3 ) )

// Convert a cell address to a native byte address, ie multiply by size_of_cell
/**/ function to_ptr( a_cell  : Cell  ) : number {  return a_cell   << 3;  }
//c/ #define  to_ptr( a_cell )         ( (char*) ( ( (u32) a_cell ) << 3 ) )

// ToDo: make it work when size_of_cell is not size_of_word
/**/ const   words_per_cell  =   size_of_cell  / size_of_word;
//c/ #define words_per_cell    ( size_of_cell  / size_of_word )

// This is like Forth's CELLS word
/**/ const   ONE = words_per_cell;
//c/ #define ONE   words_per_cell

// Other layouts could work too. 2 bytes word, 4 bytes value, 2 bytes info.
// This would make 6 bytes long cells instead of 8. ok for a 32 bits cpu.
// This would allow up to 12 bits for names, that's exactly 4096 names.
// 4 bytes cells using 2 bytes word, 2 bytes value & 2 bytes info.
// This would mean short integers and 4096 names, ok for an ESP32 style cpu.


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

function mand_cell_in_range( c : Cell ) : boolean {
  if( c >= 0
  &&  c >= the_very_first_cell
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
  return n | t << 29;
}


function unpack_type( i : Info ) : Type {
  return i >>> 29;
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

#define pack( t, n )       ( ( n ) | ( ( t ) << 29 ) )
#define unpack_type( i )   ( ( ( u32) i )    >> 29 )
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
    // Tag void is the exception, it is type is 0, aka void.
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
  de&&mand( pack( 1, 0 ) == 1 << 29 );
  de&&mand( pack( 0, 1 ) == 1 );
  de&&mand( pack( 1, 1 ) == ( 1 << 29 ) + 1 );
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
 *  cell's type is a numeric id, 0...7
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

// In this implementation, the name is a 29 bits pointer that points
// to 64 bits words, this is equivalent to a 32 bits pointer
// pointing to bytes. That's 4 giga bytes or 512 millions of cells.
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

const   type_void       = 0;
const   type_boolean    = 1;
const   type_integer    = 2;
const   type_float      = 3;
const   type_tag        = 4;
const   type_verb       = 5;
const   type_primitive  = 6;
const   type_reference  = 7;
const   type_invalid    = 8;


// When some IP is stored in the control stack, it is stored as a verb
/**/ const   type_ip = type_verb
//c/ #define type_ip   type_verb


/* -----------------------------------------------------------------------------
 *  Constant tags
 */

/*ts{*/
const tag_void      = 0;
const tag_boolean   = 1;
const tag_integer   = 2;
const tag_float     = 3;
const tag_tag       = 4;
const tag_verb      = 5;
const tag_primitive = 8
const tag_reference = 7;
const tag_invalid   = 8;
const tag_list      = 11;
const tag_text      = 12;
const tag_stack     = 13;
const tag_proxy     = 14;
const tag_flow      = 15;
const tag_range     = 16;
const tag_box       = 17;
/*}*/

/*c{
#define tag_void      0
#define tag_boolean   1
#define tag_integer   2
#define tag_float     3
#define tag_tag       4
#define tag_verb      5
#define tag_primitive 6
#define tag_reference 7
#define tag_invalid   8
#define tag_list      11
#define tag_text      12
#define tag_stack     13
#define tag_proxy     14
#define tag_flow      15
#define tag_range     16
#define tag_box       17
}*/


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
 *  check the high bit of the address of the string. If set, it is a view.
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

// When the area is freed, that header is overwritten with this tag
// It is 0 so that it is interpreted as a return if area is run as code
const the_tag_for_dynamic_next_area = 0;

// The second cell of the header is the size of the area, including the header
// This is precomputed, see init_symbols()
const the_tag_for_dynamic_area_size = 9;

// This is where to find the size, relative to the area first header address.
const offset_of_area_size = ONE;

// There is a special empty string
//c/ static Cell lean_str_init_empty( void ); // Forward
const the_empty_lean = lean_str_init_empty();

//c/ static Cell lean_str_allocate_cells_for_bytes( Length ); // Forward

function lean_str_init_empty() : Cell {
  de&&mand( bootstrapping );
  const cell = lean_str_allocate_cells_for_bytes( 1 );
  return cell;
}


//c/ static bool lean_str_is_valid( Cell ); // Forward
//c/ static Length lean_str_length( Cell ); // Forward

function lean_str_is_empty( area : Area ) : boolean {
  if( area == the_empty_lean ){
    return true;
  }
  // Only the empty lean string is empty
  if( alloc_de ){
    mand( lean_str_is_valid( area ) );
    const len = lean_str_length( area );
    mand_neq( len, 0 );
  }
  return false;
}


function lean_aligned_cell_length( len : Length ) : Length {
// Return how many cells to store bytes. Headers excluded, payload only
  // Add padding to align on the size of cells
  const padded_len = ( len + size_of_cell - 1 ) & ~( size_of_cell - 1 );
  // Divide by the size of cells to get the number of cells
  return to_cell( padded_len );
}


function leat_str_header( area : Area ) : Area {
// The header is two cells before the payload
  // Header is made of a reference counter and a size
  return area - 2 * ONE;
}


//c/ static Value lean_str_unchecked_byte_at( Cell, Index ); // Forward

function lean_str_is_valid( area : Area ) : boolean {
// Check that a cell is a valid lean string
  if( ! area_is_busy( area ) )return false;
  const size
  =  value_of( leat_str_header( area ) + 1 * ONE ) - 2 * size_of_cell;
  if( size <= 0 )return false;
  // Check that there is a null terminator
  if( lean_str_unchecked_byte_at( area, size - 1 ) != 0 )return false;
  // If size is 1 then it is a null terminator alone, ie the_empty_lean
  if( size == 1 )return area == the_empty_lean;
  // Check that last bytes are all null bytes
  let last_ii = to_cell( size + size_of_cell - 1 ) * size_of_cell - 1;
  let ii = last_ii;
  while( ii >= size ){
    if( lean_str_unchecked_byte_at( area, ii ) != 0 ){
      /*
      const ch = lean_str_unchecked_byte_at( area, ii );
      let tbl = [];
      let jj = 0;
      for( jj = 0 ; jj < last_ii ; jj++ ){
        tbl[ jj ] = lean_str_unchecked_byte_at( area, jj );
      }
      */
      debugger;
      return false;
    }
    ii -= 1;
  }
  return true;
}


function lean_str_allocate_cells_for_bytes( sz : Size ) : Area {
// Allocate cells to store a string of len bytes, including the null terminator

  // At least one bye is needed, for the null terminator
  alloc_de&&mand( sz > 0 );

  if( ! bootstrapping )return allocate_area( tag_text, sz );

  // During bootstrap, the byte area allocator is not yet available
  let needed_cells = lean_aligned_cell_length( sz );

  // Add space for the headers to fake a byte area
  needed_cells += 2;
  const header = allocate_cells( needed_cells );

  // Header 0 is a reference counter
  set_info(  header + 0 * ONE, pack( type_integer, tag_text ) );
  set_value( header + 0 * ONE, 1 );

  // Header 1 is total size in bytes, including the two headers, not aligned
  set_info(  header + 1 * ONE, pack( type_integer, the_tag_for_dynamic_area_size ) );
  set_value( header + 1 * ONE, 2 * size_of_cell + sz );

  // The convention is to address the first byte of the payload
  const area = header + 2 * ONE;

  alloc_de&&mand( area_is_busy( area ) );

  return area;

}


function lean_str_lock( area : Area ){
  area_lock( area );
}


function lean_str_free( area : Area ){

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


function lean_str_unchecked_byte_at( cell : Cell, index : Index ) : Value {
  // TypeScript version uses the mem8 view on the memory buffer
  /**/ return mem8[ to_ptr( cell ) + index ];
  // AssemblyScript version uses the load<u8> function
  //a/ return load<u8>( to_ptr( cell ) + index );
  // C++ version uses the memory buffer directly
  //c/ return *(char*)  ( to_ptr( cell ) + index );
}


function lean_str_byte_at( area : Area, index : Index ) : Value {
  if( alloc_de ){
    mand( lean_str_is_valid( area ) );
    mand( index >= 0 );
    mand( index < lean_str_length( area ) );
  }
  return lean_str_unchecked_byte_at( area, index );
}


function lean_str_byte_at_put( area : Cell, index : Index, val : Value ){
// Set a byte at some position inside a byte area
  // TypeScript version uses the mem8 view on the memory buffer
  /**/ mem8[ to_ptr( area ) + index ] = val & 0xFF;
  // AssemblyScript version uses the store<u8> function
  //a/ store<u8>( to_ptr( cell ) + index, val & 0xFF );
  // C++ version uses the memory buffer directly
  // On ESP32, some memory regions are not byte adressable,
  // hence the bytes should be inserted into the 32 bits word
  //c/ *(char*) ( to_ptr( area ) + index ) = val & 0xFF;
  alloc_de&&mand_eq( lean_str_byte_at( area, index ), val );
}


function lean_str_byte_at_from( dst : Area, d_i : Index, src : Area, s_i : Index ){
// Copy a byte from a byte area to another one
  // TypeScript version uses the mem8 view on the memory buffer
  /**/ mem8[      to_ptr( dst ) + d_i ] = mem8[      to_ptr( src ) + s_i ];
  // AssemblyScript version uses the store<u8> function
  //a/ store<u8>( to_ptr( dst ) + d_i,    load<u8>(  to_ptr( src ) + s_i ) );
  // C++ version uses char pointers directly
  //c/ *(char*) ( to_ptr( dst) + d_i )  = *(char*) ( to_ptr( src ) + s_i );
}

//c/ static Size area_payload_size( Cell ); // Forward

function lean_str_length( area : Area ) : Length {
// Return the length of a lean string
  alloc_de&&mand( lean_str_is_valid( area ) );
  // Fast path for empty strings
  if( area == the_empty_lean )return 0;
  // Don't include the null terminator
  return area_payload_size( area ) - 1;
}


function lean_str_new_from_native( str : TxtC ) : Area {
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
      return the_empty_lean;
    }

    // Convert using a TextEncoder, utf-8 is the default encoding
    // ToDo: figure a way to avoid the tempory buffer
    const encoder = new TextEncoder();
    const buf = encoder.encode( str );

    // Get the byte length of the string
    const str_len = buf.length;

    // Allocate space to store the bytes, + 1 for the null terminator
    const area = lean_str_allocate_cells_for_bytes( str_len + 1 );

    // Copy the bytes, via a transient view
    const view = new Uint8Array( mem, to_ptr( area ), str_len + 1 );
    view.set( buf );

  /*}*/

  // C++ version uses fast memcpy(), the destination is filled with 0 bytes
  /*c{
    Count str_len = strlen( str );
    if( str_len == 0 )return the_empty_lean;
    Area area = lean_str_allocate_cells_for_bytes( str_len + 1 );
    memcpy( (char*) ( (int) to_ptr( area ) ), str, str_len );
  }*/

  // ToDo: AssemblyScript version

  alloc_de&&mand_eq( lean_str_length( area ), str_len );
  return area;
}


function lean_str_as_native( area : Area ) : TxtC {
// Create a native string from a lean string. Shared representations.

  if( alloc_de ){
    // Check that the cell is a valid lean string
    alloc_de&&mand( lean_str_is_valid( area ) );
  }

  // C++ version is simple, it is already a compatible native string
  /*c{
    return (char*) to_ptr( area );
  }*/

  /*ts{*/
    // Return the empty string?
    if( area == the_empty_lean )return "";
    // ToDo:: optimize this a lot, using a Javascript TextDecoder
    const len = lean_str_length( area );
    let str = "";
    let ii;
    for( ii = 0; ii < len; ii++ ){
      str += String.fromCharCode( lean_str_byte_at( area, ii ) );
    }
    return str;
  /*}*/

}


function lean_str_eq( area1 : Area, area2 : Area ) : boolean {
// Compare two lean strings for equality

  // Check that the two cells are valid lean strings
  alloc_de&&mand( lean_str_is_valid( area1 ) );
  alloc_de&&mand( lean_str_is_valid( area2 ) );

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
    alloc_de&&mand_eq( lean_str_byte_at( area1, 0 ), 0 );
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
    u64* end_ptr = start_ptr + ( sz / sizeof( u64 ) );
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
    let ii;
    for( ii = 0 ; ii < length ; ii++ ){
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
static bool lean_str_eq_with_c_str( Cell cell1, TxtC str ){
// Compare a lean string with a native string

  if( cell1 == the_empty_lean ){
    return str[ 0 ] == 0;
  }

  const len1 = lean_str_length( cell1 );
  const len2 = strlen( str );
  if( len1 != len2 ){
    return false;
  }

  return memcmp( (char*) to_ptr( cell1 ), str, len1 ) == 0;

}

}*/


function lean_str_cmp( cell1 : Cell, cell2 : Cell ) : Value {
// Compare two lean strings, return -1, 0 or 1 depending on order

  // TypeScript version
  /*ts{*/
    const len1 = lean_str_length( cell1 );
    const len2 = lean_str_length( cell2 );
    const len = len1 < len2 ? len1 : len2;
    let ii;
    for( ii = 0 ; ii < len ; ii++ ){
      const byte1 = lean_str_byte_at( cell1, ii );
      const byte2 = lean_str_byte_at( cell2, ii );
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
    auto len1 = lean_str_length( cell1 );
    auto len2 = lean_str_length( cell2 );
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


function lean_str_new_from_strcat( area1 : Area, area2 : Area ) : Area {
// Concatenate two lean strings, returns a new string

  // Deal with the empty strings
  const len1 = lean_str_length( area1 );
  if( len1 == 0 ){
    lean_str_lock( area2 );
    return area2;
  }

  const len2 = lean_str_length( area2 );
  if( len2 == 0 ){
    lean_str_lock( area1 );
    return area1;
  }

  // Add one for the final null terminator
  const len = len1 + len2 + 1;

  // Allocate the needed cells
  const new_area = lean_str_allocate_cells_for_bytes( len );

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
      lean_str_byte_at_from( new_area, ii, area1, ii );
      ii++;
    }
    // Copy the second string
    let jj = 0;
    while( ii < len ){
      lean_str_byte_at_from( new_area, ii, area2, jj );
      ii++;
      jj++;
    }
  /*}*/

  alloc_de&&mand_eq( lean_str_length( new_area ), len - 1 );
  return new_area;

}


function lean_str_index( target : Cell, pattern : Cell ) : Value {
// Find the first occurence of str2 in str1

  // ToDo: fast C++ version
  const len_target  = lean_str_length( target );
  const len_pattern = lean_str_length( pattern );

  // Can't find big in small
  if( len_pattern > len_target )return -1;

  // Loop over the target
  let ii = 0;
  let jj = 0;
  let last_possible = len_target - len_pattern;
  for( ii = 0 ; ii <= last_possible ; ii++ ){
    // Check if the first character matches
    if( lean_str_byte_at( target, ii ) == lean_str_byte_at( pattern, 0 ) ){
      // Loop over the rest of the pattern
      for( jj = 1 ; jj < len_pattern; jj++ ){
        // Check if the characters match
        if( lean_str_byte_at( target,  ii + jj )
        !=  lean_str_byte_at( pattern, jj )
        ){
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


function lean_str_rindex( target : Cell, pattern : Cell ) : Value {
// Find the last occurence of str2 in str1

  // ToDo: fast C++ version
  let ii = 0;
  let jj = 0;

  const len_target  = lean_str_length( target );
  const len_pattern = lean_str_length( pattern );

  // Can't find big in small
  if( len_pattern > len_target )return -1;

  // Loop over the target, starting at the end
  for( ii = len_target - 1 ; ii >= 0 ; ii-- ){
    // Check if the first character matches
    if( lean_str_byte_at( target, ii ) == lean_str_byte_at( pattern, 0 ) ){
      // Loop over the rest of the pattern
      for( jj = 1 ; jj < len_pattern; jj++ ){
        // Check if the characters match
        if( lean_str_byte_at( target,  ii + jj )
        !=  lean_str_byte_at( pattern, jj )
        ){
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

  // If past the end, return the empty string
  const str_len = lean_str_length( str );

  // Handle negative start position
  if( start < 0 ){
    start = str_len + start;
  }

  if( start >= str_len ){
    return the_empty_lean;
  }

  // Truncate the length if needed
  if( start + len > str_len ){
    len = str_len - start;
  }

  // If same length, then return the whole string
  if( len == str_len ){
    lean_str_lock( str );
    return str;
  }

  // If the substring is empty, return the empty string
  if( len <= 0 ){
    return the_empty_lean;
  }

  // ToDo: if big enough, share the string
  // This requires to detect that cstr points to a substring.
  // It also means that .c_str() must turn the substring into
  // a full string, null terminated, ie stop sharing.
  // This is worth the trouble once lean mode is stable.
  // See comments about short string optimization.

  // Allocate the result
  const new_area = lean_str_allocate_cells_for_bytes( len + 1 );

  // Copy the substring
  // ToDo: fast C++ version
  let ii = 0;
  for( ii = 0 ; ii < len ; ii++ ){
    lean_str_byte_at_from( new_area, ii, str, start + ii );
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
  // It's aligned a cell boundary because it is a byte area from allocate_bytes()
  char* cstr;

  // Constructor for an empty string
  LeanString( void ){
    // An empty string shares the empty string singleton
    lean_str_lock( the_empty_lean );
    cstr = to_cstr( the_empty_lean );
  }

  // Constructor from a C string
  LeanString( TxtC str ){
    cstr = to_cstr( lean_str_new_from_native( str ) );
  }

  // Constructor from a C string literal
  template< std::size_t N >
  LeanString( const char (&str)[N] ){
    cstr = to_cstr( lean_str_new_from_native( str ) );
  }

  // Constructor from a dynamically allocated byte area
  LeanString( Area area ){
    // No copy, just share the same area
    lean_str_lock( area );
    cstr = to_ptr( area );
  }

  // Copy constructor
  LeanString( const LeanString& str ){
    // Share the other string, increment the reference counter
    cstr = str.cstr;
    lean_str_lock( to_cell( cstr ) );
  }

  // Destructor
  ~LeanString( void ){
    // "unshare" the string, decrement the reference counter
    lean_str_free( to_cell( cstr ) );
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
    lean_str_free( to_cell( cstr ) );
    // Then share the new one
    lean_str_lock( to_cell( str.cstr ) );
    cstr = str.cstr;
    return *this;
  }

  // Assignment operator from a C string
  LeanString& operator=( TxtC str ){
    // Forget the old string
    lean_str_free( to_cell( cstr ) );
    // Make a new one to remplace the old one
    cstr = to_cstr( lean_str_new_from_native( str ) );
    return *this;
  }

  // Concatenation operator
  LeanString operator+( const LeanString& str ) const {
    // ToDo: optimize this
    Area str2 = lean_str_new_from_strcat(
      to_cell( cstr ),
      to_cell( str.cstr )
    );
    auto r = LeanString( str2 );
    lean_str_free( str2 );
    return r;
  }

  // Concatenation operator from a C string
  LeanString operator+( TxtC str ) const {
    // ToDo: optimize this
    Area str1 = lean_str_new_from_native( str );
    Area str2 = lean_str_new_from_strcat( to_cell( cstr ), str1 );
    auto r = LeanString( str2 );
    lean_str_free( str1 );
    lean_str_free( str2 );
    return r;
  }

  // In place concatenation operator
  LeanString& operator+=( const LeanString& str ){
    // Replace the old string by a new one
    auto old_cell = to_cell( cstr );
    cstr = to_cstr( lean_str_new_from_strcat( old_cell, to_cell( str.cstr ) ) );
    // Unshare the old one
    lean_str_free( old_cell );
    return *this;
  }

  // In place concatenation operator for a C string
  LeanString& operator+=( TxtC str ){
    auto old_cell = to_cell( cstr );
    auto str1 = lean_str_new_from_native( str );
    cstr = to_cstr( lean_str_new_from_strcat( old_cell, str1 ) );
    lean_str_free( old_cell );
    lean_str_free( str1 );
    return *this;
  }

  // In place concatenation operator for a char
  LeanString& operator+=( char c ){
    // ToDo: optimize this
    // There is often space for an extra char in the last cell
    auto old_cell = to_cell( cstr );
    char buf[ 2 ] = { c, '\0' };
    auto str1 = lean_str_new_from_native( buf );
    cstr = to_cstr( lean_str_new_from_strcat( old_cell, str1 ) );
    lean_str_free( old_cell );
    lean_str_free( str1 );
    return *this;
  }

  // Comparison operator
  bool operator==( const LeanString& str ) const {
    return lean_str_eq( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Comparison operator with a C string
  bool operator==( TxtC str ) const {
    auto r = lean_str_eq_with_c_str( to_cell( cstr ), str );
    return r;
  }

  // Comparison operator
  bool operator!=( const LeanString& str ) const {
    return ! lean_str_eq( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Comparison operator with a C string
  bool operator!=( TxtC str ) const {
    auto r = ! lean_str_eq_with_c_str( to_cell( cstr ), str );
    return r;
  }

  // Returns the length of the string
  size_t length() const {
    return lean_str_length( to_cell( cstr ) );
  }

  // Return a substring
  LeanString substr( size_t pos, size_t len ) const {
    // ToDo: optimize this
    Area str2 = lean_substr( to_cell( cstr ), pos, len );
    auto r = LeanString( str2 );
    lean_str_free( str2 );
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
    return lean_str_index( to_cell( cstr ), to_cell( str.cstr ) );
  }

  // Find a substring, from the end
  int rfind( const LeanString& str ) const {
    return lean_str_rindex( to_cell( cstr ), to_cell( str.cstr ) );
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


static int lean_str_cmp( const LeanString& str1, TxtC str2 ){
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
static Text  cell_as_text( Cell );
static Text  float_as_text( Float );
static Text  tag_as_text( Tag );
static Text  type_as_text( Index );
static Text  proxy_as_text( Cell );
static Text  integer_as_text( Value );
static Text  text_of_verb_definition( Tag );
static Text  inox_machine_code_cell_as_text( Cell );
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
 *  tcut(), tbut(), tat() and tmid() to extract sub parts of the text.
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
 *  tsome( text )
 *    Return true if the text is not empty.
 */

/**/ function tsome( s : Text ){ return s.length > 0; }
//c/ static bool tsome( const Text& s ){ return s.length() > 0; }
//c/ static bool tsome( TxtC s ){ return s[ 0 ] != '\0'; }


/*
 *  tnone( text )
 *    Return true if the text is empty.
 *    Note: this is the opposite of tsome().
 */

/**/ function tnone( s : Text ){ return s.length == 0; }
//c/ static bool tnone( const Text& s ){ return s.length() == 0; }
//c/ static bool tnone( TxtC s ){ return s[ 0 ] == '\0'; }


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
 *    Return n first characters of text, or but last one if n is negative.
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
 *     If start is negative, it is counted from the end of the text.
 *     If end is negative, it is counted from the end of the text.
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
    if( start < 0 ){
      start = 0;
    }
  }
  if( end < 0 ){
    end = len + end;
    if( end < 0 ){
      return no_text;
    }
  }
  if( end > len ){
    end = len;
  }
  if( start >= end ){
    return no_text;
  }
  return t.substr( start, end - start );
}
}*/

/*
 *  tat( pos )
 *  Return one character of text at specified position.
 *  If position is negative, it is counted from the end of the text.
 *  If out of range, return "".
 *  I.e. text "at" some position.
 */

function tat( t : Text, pos : Index ) : Text {
  const len = tlen( t );
  if( pos < 0 ){
    pos = len + pos;
  }
  if( pos < 0 || pos >= len )return no_text;
  /**/ return t[ pos ];
  //c/ return t.at( pos );
}


/*
 *  tlow( text )
 *  Return text in lower case.
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
 *  Return text in upper case.
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
 *  Return true if two texts are the same text.
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
 *  Return true if two texts are not the same text.
 *  I.e. the opposite of teq().
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


/*
 *  tpre( prefix, text ) true if text starts with prefix
 */

function tpre( pre : ConstText, txt : ConstText ) : boolean {
  /**/ return txt.startsWith( pre );
  // ToDo: implement txt.start_with( pre )
  //c/ return txt.find( pre ) == 0;
}


/*
 *  tsuf( suffix, text ) true if text ends with suffix
 */

function tsuf( suf : ConstText, txt : ConstText ) : boolean {
  /**/ return txt.endsWith( suf );
  // ToDo: implement txt.ends_with( suf )
  //c/ return txt.rfind( suf ) == txt.length() - suf.length();
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
        S()+ "bad eq " + tag_as_text( a ) + " / " + tag_as_text( b )
      );
    }else if( tag_is_valid( a ) ){
      trace( S()+ "bad eq " + tag_as_text( a ) + " / " + N( b ) );
    }else{
      trace( S()+ "bad eq " + N( a ) + " / " + tag_as_text( b ) );
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
  the_very_first_cell = to_cell( (int) ( (u64*) calloc( INOX_HEAP_SIZE / 8, 8 ) ) );
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
    the_very_first_cell = to_cell( (int) calloc( INOX_HEAP_SIZE / 8, 8 ) );

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
      tag_void,
      0
    );
    set(
      the_cell_limit - 1 * ONE,
      type_integer,
      the_tag_for_dynamic_area_size,
      2 * size_of_cell // empty payload
    );
    the_previous_chunk_area = the_cell_limit;
    alloc_de&&mand_cell_name(
      the_previous_chunk_area - 2 * ONE,
      tag_void
    );
    alloc_de&&mand_cell_name(
      the_previous_chunk_area - 1 * ONE,
      the_tag_for_dynamic_area_size
    );

    // Reduce the limit accordingly
    the_cell_limit -= 2 * ONE;

  }*/

  the_next_free_cell = the_very_first_cell;

  // Avoid using the addresses that match a type id
  // It helps for debugging traces, see N() and C()
  /**/ allocate_cells( 8 );

  // The first allocated cell is a tempory cell that is sometimes convenient
  the_tmp_cell = allocate_cell();

  return 1;
}

//c/ #endif


/* -----------------------------------------------------------------------------
 *  The memory
 *
 *  The memory is the place where data manipulated by the Inox interpreter is
 *  stored. It looks like a contiguous area of memory, divided into cells. Each *  cell is 64 bits wide, 3 parts : 3 bits for the type of the cell, 29 bits for
 *  for the name of the cell and 32 bits for the value of the cell. Such values
 *  are called "named values". Each cell has an address. It is the index of the
 *  cell in the memory. The possible range extends from 0 to 2^29-1, ie
 *  approximately 512 million cells. It should be possible to change the size of
 *  a cell, either to reduce it or to increase it. The size of a cell is defined
 *  by the size_of_cell constant, itself defined as the addition of 32 bits for
 *  the value, 29 bits for the name and 3 bits for the type, the type and name
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
  let min_size = area_align_size( sz );

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
      // Workaround: ask for a bigger chunk until it is address is higher
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
    alloc_de&&mand_eq( name_of( old_gap_area - 2 * ONE ), tag_void );
    alloc_de&&mand_cell_name(   old_gap_area - 1 * ONE, the_tag_for_dynamic_area_size );

    // Reinitialize the previous chunck's busy gap area headers
    area_init_busy( old_gap_area, 1, gap_size );

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
      tag_void,
      0
    );
    set(
      new_gap_area - 1 * ONE,
      type_integer,
      the_tag_for_dynamic_area_size,
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
 *  For (much) better allocator, see https://github.com/microsoft/mimalloc
 */

// Small areas are allocated from specialized pools
const small_areas_length_limit = 10;


function init_area_allocator() : Index {

  // Check precomputed tags
  de&&mand_eq( 0,               the_tag_for_dynamic_next_area );
  de&&mand_eq( tag( "void" ),   the_tag_for_dynamic_next_area );
  de&&mand_eq( tag( "_dynsz" ), the_tag_for_dynamic_area_size );

  // Create a fake free area to simplify the code
  the_first_free_area = allocate_cells( 2 ) + 2 * ONE;
  area_turn_free( the_first_free_area, 0 );
  area_set_size(  the_first_free_area, 2 * size_of_cell );

  // This completes the low level bootstrap phase 1
  bootstrapping = false;

  alloc_de&&mand( area_is_free( the_first_free_area ) );

  return 1;

}


function header_of_area( area : Area ) : Cell {
// Return the address of the first header cell of a byte area, the ref count.
  return area - 2 * ONE;
}

function area_from_header( header : Cell ) : Area {
// Return the address of an area given the address of it's first header cell.
  // Skip the two header cells, the reference counter and the size
  return header + 2 * ONE;
}


function area_ref_count( area : Area ) : Value {
// Return the value of the reference counter of a byte area
  alloc_de&&mand( area_is_busy( area ) );
  return value_of( header_of_area( area ) );
}


function area_turn_busy( area : Area, klass : Tag, sz : Size ){
// Set the reference counter header of a free byte area to 1, ie it becomes busy
  const header = header_of_area( area );
  // Before it becomes busy, it was free, so it must have a next_area header
  alloc_de&&mand_cell_name( header, the_tag_for_dynamic_next_area );
  set( header, type_integer, klass, 1 );
  alloc_de&&mand_cell_name( header + ONE, the_tag_for_dynamic_area_size );
  set_value( header + ONE, sz );
}


function area_turn_free( area : Area, next_area : Area ){
// Set the tag of the header of a byte area to tag_dynamic_next_area
  const header = header_of_area( area );
  set( header, type_void, the_tag_for_dynamic_next_area, next_area );
}


function area_init_busy( area : Area, klass : Tag, size : Count ){
// Initialize a new busy area
  const header = header_of_area( area );
  set( header, type_integer, klass, 1 );
  set( header + ONE, type_integer, the_tag_for_dynamic_area_size, size );
}


function area_is_busy( area : Area ) : boolean {
// Return true if the area is busy, false if it is free
  alloc_de&&mand( area_is_safe( area ) );
  return name_of( header_of_area( area ) ) != the_tag_for_dynamic_next_area;
}


function area_is_free( area : Area ) : boolean {
// Return true if the area is free, false if it is busy
  alloc_de&&mand( area_is_safe( area ) );
  return name_of( header_of_area( area ) ) == the_tag_for_dynamic_next_area;
}


function area_cell_is_area( cell : Cell ) : boolean {
// Return true if the cell is the first cell of a dynamic area, false otherwise
  // This is maybe not 100% reliable, but it is good enough
  const first_header = header_of_area( cell );
  if( name_of( first_header + ONE ) == the_tag_for_dynamic_area_size ){
    if( type_of( first_header ) == type_void ){
      if( name_of( first_header ) == the_tag_for_dynamic_next_area ){
        alloc_de&&mand( area_is_free( cell ) );
      }else{
        alloc_de&&mand( area_is_busy( cell ) );
      }
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
  return value_of( header_of_area( area ) );
}


function area_set_next( area : Area, nxt : Area ){
// Set the address of the next free area
  set_value( header_of_area( area ), nxt );
  alloc_de&&mand( area_is_free( area ) );
}


function area_set_ref_count( area : Area, v : Value ){
// Set the reference counter of a byte area
  alloc_de&&mand( area_is_busy( area ) );
  set_value( header_of_area( area ), v );
}


function area_size( area : Area ) : Size {
// Return the size of a byte area, in bytes, aligned. It includes the 2 header cells
  alloc_de&&mand( area_is_safe( area ) );
  const byte_size = value_of( header_of_area( area ) + ONE );
  alloc_de&&mand( byte_size >= 2 * size_of_cell );
  // Do as if last cell was fully occupied
  const aligned_size = ( byte_size + size_of_cell - 1 ) & ~( size_of_cell - 1 );
  // Free area sizes are always aligned, not true for busy areas
  alloc_de&&mand(
    aligned_size == byte_size
    || name_of( header_of_area( area ) ) != the_tag_for_dynamic_next_area
  );
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
  const sz = value_of( area - 1 * ONE ) - 2 * size_of_cell;
  alloc_de&&mand( sz > 0 );
  return sz;
}


function area_set_size( area : Area, sz : Size ) : void {
// Set the size of the area, including the size of the header, but not aligned
  alloc_de&&mand( sz >= 2 * size_of_cell );
  const header = header_of_area( area );
  // The second header is after the first one, ie after the reference counter
  set( header + ONE, type_integer, the_tag_for_dynamic_area_size, sz );
}


function area_align_size( s : Size ) : Size {
// Align on size of cells, ie 7 becomes 8, 8 stays 8, 9 becomes 16, etc
  let aligned_size = ( s + ( size_of_cell - 1 ) ) & ~( size_of_cell - 1 );
  return aligned_size;
}


// All budy lists are empty at first, index is number of cells in area
/**/  const all_free_lists_by_area_length : Array< Cell >
/**/  = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
/*c{
u32 all_free_lists_by_area_length[ small_areas_length_limit ]
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
  for( ii = 0 ; ii < small_areas_length_limit ; ii++ ){
    let free;
    while( ( free = all_free_lists_by_area_length[ ii ] ) != 0 ){
      all_free_lists_by_area_length[ ii ] = area_next( free );
      area_set_next( free, the_first_free_area );
      the_first_free_area = free;
      alloc_de&&mand( area_is_free( free ) );
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
    if( ! area_cell_is_area( cell + 2 * ONE ) ){
      continue;
    }

    // If busy, skip it
    if( ! area_is_free( cell + 2 * ONE ) ){
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
      || ! area_cell_is_area( potential_next_area )
      || ! area_is_free(      potential_next_area )
      ){
        break;
      }

      // Coalesce consecutive two free areas
      let total_size = area_size( cell ) + area_size( potential_next_area );
      area_set_size( cell, total_size );
      area_set_next( cell, area_next( potential_next_area ) );
      reset( header_of_area( potential_next_area ) );
      reset( header_of_area( potential_next_area ) + ONE );

      // If that was the head of the free list, update it
      if( the_first_free_area == potential_next_area ){
        the_first_free_area = cell;
        alloc_de&&mand( area_is_free( the_first_free_area ) );
      }
      how_much_was_collected++;

      // Check that it did work
      if( alloc_de ){
        mand( area_is_free( cell ) );
        mand( ! area_cell_is_area( potential_next_area ) );
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
let area_stat_bigger_requested_bytes  = 0;
let area_stat_allocated_bytes         = 0;
let area_stat_freed_bytes             = 0;
let area_stat_allocated_areas         = 0;
let area_stat_freed_areas             = 0;
let area_stat_allocated_small_bytes   = 0;
let area_stat_freed_small_bytes       = 0;
let area_stat_allocated_small_areas   = 0;
let area_stat_freed_small_areas       = 0;


function area_is_empty( area : Area ) : boolean {
// Return true if the area is full of zeroes, false otherwise
  // Adjust size to be a multiple of size of cell, 16
  const len = area_length( area );
  let ii = 0;
  while( ii < len ){
    if( value_of( area + ii * ONE ) != 0 )return false;
    if( info_of(  area + ii * ONE ) != 0 )return false;
    ii++;
  }
  return true;
}

function mand_empty_area( area : Area ) : boolean {
// Check that the area is empty
  if( ! area_is_empty( area ) ){
    debugger;
    FATAL( "mand_empty_area() failed" );
  }
  return true;
}


function area_list_length( area : Area ) : Count {
// Return the number of areas in the list
  if( area == 0 )return 0;
  let count = 1;
  let next_area = area_next( area );
  let limit = 1000000;
  while( next_area != 0 ){
    count++;
    if( count > limit ){
      debugger;
      FATAL( "area_list_length() failed" );
    }
    next_area = area_next( next_area );
  }
  return count;
}


let free_area_max_length = 0;

let area_monitor_entered = 0;

function area_monitor(){
// Check that the free area list is not too long

  if( allocate_area_entered != 0 )return;
  if( area_monitor_entered  != 0 )return;
  area_monitor_entered = 1;

  let count = 0;
  let next_area = the_first_free_area;
  let previous_area = 0;
  let total_large_free_bytes = 0;
  let bigger_size = 0;
  let loop_detector = 1000000;
  let size = 0;

  while( true ){

    if( --loop_detector == 0 ){
      debugger;
      area_monitor_entered = 0;
      FATAL( "Area, loop detected" );
      return;
    }

    count++;
    next_area = area_next( next_area );
    if( next_area == 0 )break;

    size = area_size( next_area );
    total_large_free_bytes += size;
    if( size > bigger_size ){
      bigger_size = size;
    }

    // Check for missed potential reunion of two free areas
    if( previous_area != 0 ){
      // When the next area is right after the previous one
      if( previous_area + to_cell( area_size( previous_area ) ) == next_area ){
        if( previous_area == the_first_free_area ){
          area_monitor_entered = 0;
          FATAL( "Area, bad consecutive free areas" );
          return;
        }
      }
      // When the next area is right before the previous one
      if( next_area + to_cell( area_size( next_area ) ) == previous_area ){
        if( previous_area == the_first_free_area ){
          FATAL( "Area, bad consecutive reversed free areas" );
          return;
        }
      }
      // Check size is not too small to be in the large free area list
      if( size < small_areas_length_limit * size_of_cell ){
        // Skip the special fake small free area that is always in the list
        if( size != 2 * size_of_cell ){
          area_monitor_entered = 0;
          FATAL( "Area, too small free area" );
          return;
        }
      }
    }
    previous_area = next_area;
  }

  if( count > free_area_max_length ){
    free_area_max_length = count;

    // About small areas
    let small_length = 0;
    let list_length = 0;
    let auto_ = S()+ "small areas:";
    let total_small_areas = 0;
    let total_small_free_bytes = 0;
    let small_free_bytes = 0;
    while( small_length < small_areas_length_limit ){
      list_length
      = area_list_length( all_free_lists_by_area_length[ small_length ] );
      if( list_length == 0 ){
        small_length++;
        continue;
      }
      total_small_areas += list_length;
      auto_ += S() + "\n" + N( small_length ) + ": " + N( list_length );
      small_free_bytes = 0;
      next_area = all_free_lists_by_area_length[ small_length ];
      loop_detector = 1000000;
      while( true ){
        if( --loop_detector == 0 ){
          debugger;
          area_monitor_entered = 0;
          FATAL( "Area, loop detected for length " + N( small_length ) );
          return;
        }
        size = area_size( next_area );
        small_free_bytes += size;
        total_small_free_bytes += size;
        next_area = area_next( next_area );
        if( next_area == 0 )break;
      }
      auto_ += S() + ", bytes: " + N( small_free_bytes );
      small_length += 1;
    }

    bug( S()
      + "Area monitoring"
      + ",\n free area list length: " + N( count )
      + ",\n total large free bytes: " + N( total_large_free_bytes )
      + ",\n bigger free area's size: " + N( bigger_size )
      + ",\n bigger requested bytes: " + N( area_stat_bigger_requested_bytes )
      + ",\n allocated bytes: " + N( area_stat_allocated_bytes )
      + ",\n freed bytes: " + N( area_stat_freed_bytes )
      + ",\n delta: " + N( area_stat_allocated_bytes - area_stat_freed_bytes )
      + ",\n allocated areas: " + N( area_stat_allocated_areas )
      + ",\n freed areas: " + N( area_stat_freed_areas )
      + ",\n delta: " + N( area_stat_allocated_areas - area_stat_freed_areas )
      + ",\n total small areas: " + N( total_small_areas )
      + ",\n total small free bytes: " + N( total_small_free_bytes )
      + ",\n allocated small bytes: " + N( area_stat_allocated_small_bytes )
      + ",\n freed small bytes: " + N( area_stat_freed_small_bytes )
      + ",\n delta: " + N( area_stat_allocated_small_bytes - area_stat_freed_small_bytes )
      + ",\n allocated small areas: " + N( area_stat_allocated_small_areas )
      + ",\n freed small areas: " + N( area_stat_freed_small_areas )
      + ",\n delta: " + N( area_stat_allocated_small_areas - area_stat_freed_small_areas )
      + ",\n" + auto_
    );
    area_stat_bigger_requested_bytes = 0;
  }

  area_monitor_entered = 0;
}


function allocate_area( klass : Tag , sz : Size ) : Area {

  /*c{
  #ifdef INOX_USE_MALLOC

    // This is for debugging only because it is not efficient
    // in terms of memory usage. It adds the overhead of malloc
    // plus the overhead of the rarely used terminating null cell.
    // On a 32 bit system, that's 8 bytes for the terminating null cell
    // and at least 8 bytes for malloc's overhead itself.
    // That's why it is much better to use the custom allocator.
    // However, when debugging, it is useful to use malloc together
    // with valgrind or other tools to detect memory leaks and
    // other problems like buffer overflows.

    // Add space to hold headers and terminating return and then align size
    const adjusted_size = area_align_size( sz ) + 3 * size_of_cell;

    // Allocate memory, cleared to 0
    void* ptr = calloc( adjusted_size / size_of_cell, size_of_cell );
    if( ptr == 0 ){
      return 0;
    }

    // Area is right after the class and size
    u32 area = to_cell( ptr ) + 2 * ONE;

    // Update memory check limits
    if( area >= the_cell_limit ){
      the_cell_limit = area + adjusted_size / size_of_cell + ONE;
    }else if( ( area - 2 * ONE ) < the_very_first_cell ){
      the_very_first_cell = area - 2 * ONE;
    }

    // Update stats
    area_stat_allocated_bytes += adjusted_size;
    area_stat_allocated_areas += 1;

    // Initialize reference counter and fill in class and size
    set(
      area - 2 * ONE,
      type_integer, klass, 1
    );
    set(
      area - ONE,
      type_integer, the_tag_for_dynamic_area_size, sz + 2 * size_of_cell
    );

    return area;

  #endif
  }*/

  /*c{
    #ifndef INOX_USE_MALLOC
  }*/

  if( alloc_de ){
    if( allocate_area_entered != 0 ){
      debugger;
      FATAL( "allocate_area() reentered" );
      return 0;
    }
  }

  // To detect some catastrophic errors
  allocate_area_entered = 1;

  // There is always a first free area, the first dummy one if needed
  alloc_de&&mand( area_is_free( the_first_free_area ) );

  // Align on 64 bits, size of a cell, plus size of headers
  let adjusted_size = area_align_size( sz ) + 2 * size_of_cell;

  alloc_de&&mand( adjusted_size >= 2 * size_of_cell );

  // Remember bigger requested size so far
  if( adjusted_size > area_stat_bigger_requested_bytes ){
    area_stat_bigger_requested_bytes = adjusted_size;
  }

  // Search in "per length" free lists if size is small enough
  if( adjusted_size < small_areas_length_limit * size_of_cell ){
    let length = to_cell( adjusted_size ) - 2;
    let small_free_area = all_free_lists_by_area_length[ length ];
    if( small_free_area ){
      all_free_lists_by_area_length[ length ] = area_next( small_free_area );
      area_turn_busy( small_free_area, klass, sz + 2 * size_of_cell );
      area_stat_allocated_bytes += adjusted_size;
      area_stat_allocated_areas += 1;
      area_stat_allocated_small_bytes += adjusted_size;
      area_stat_allocated_small_areas += 1;
      alloc_de&&mand_empty_area( small_free_area );
      allocate_area_entered = 0;
      return small_free_area;
    }
  }

  // Search first fit, starting from the first item of the free area list
  let area = the_first_free_area;
  let area_sz = 0;
  let previous_area = 0;
  let limit = 100000;
  let tmp_next = 0;

  while( area ){

    // Never loop forever
    if( limit-- == 0 ){
      allocate_area_entered = 0;
      // ToDo: this does happen, but it is not clear why
      FATAL( "Infinite loop in allocate_area" );
      return 0;
    }

    alloc_de&&mand( area_is_free( area ) );

    // Sort the list of free areas by address, bubble sort style, incremental
    if( previous_area && false ){
      if( previous_area > area ){
        // Swap areas, the lower address "bubbles" down the list
        tmp_next = area_next( area );
        area_set_next( previous_area, tmp_next );
        area_set_next( area, previous_area );
        if( the_first_free_area == previous_area ){
          the_first_free_area = area;
          alloc_de&&mand( area_is_free( the_first_free_area ) );
        }
        tmp_next = previous_area;
        previous_area = area,
        area = tmp_next;
        alloc_de&&mand_eq( area_next( previous_area ), area );
        alloc_de&&mand_neq( area, 0 );
      }
      // Coalesce adjacent areas
      if( previous_area + to_cell( area_sz ) == area ){
        tmp_next = area_next( area );
        area_set_next( previous_area, tmp_next );
        area_set_size( previous_area, area_sz + area_size( area ) );
        // Empty the area, it is now part of the previous area
        reset( area - 2 * ONE );
        reset( area - ONE );
        if( area == the_first_free_area ){
          the_first_free_area = previous_area;
        }
        // Can't une the area now, proper previous area is unknown, skip it
        area = tmp_next;
        if( area == 0 )break;
      }
    }

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

    // If the area is not the first one, remove it from the list
    if( area != the_first_free_area ){
      alloc_de&&mand_eq( area_next( previous_area ), area );
      area_set_next( previous_area, area_next( area ) );

    // if the area is the first one, update the head of the list
    }else{
      alloc_de&&mand_eq( area, the_first_free_area );
      the_first_free_area = area_next( area );
      alloc_de&&mand( area_is_free( the_first_free_area ) );
    }

    // Break big area and release extra space
    let remaining_size = area_sz - adjusted_size;

    // Only split if the remaining area is big enough for the smallest payload
    if( remaining_size > 2 * size_of_cell ){
      let remaining_area = area + to_cell( adjusted_size );
      area_set_size( remaining_area, remaining_size );
      // If the remaining size is small, move it to one of the small area lists
      if( remaining_size < small_areas_length_limit * size_of_cell ){
        let remaining_length = to_cell( remaining_size ) - 2;
        area_set_next( remaining_area, all_free_lists_by_area_length[ remaining_length ] );
        all_free_lists_by_area_length[ remaining_length ] = remaining_area;
        area_stat_freed_small_areas += 1;
        area_stat_freed_small_bytes += remaining_size;
      }else{
        // The remaining area becomes the new first free area
        area_turn_free( remaining_area, the_first_free_area );
        alloc_de&&mand( area_is_free( the_first_free_area ) );
        area_set_next( remaining_area, the_first_free_area );
        the_first_free_area = remaining_area;
        alloc_de&&mand( area_is_free( remaining_area ) );
        // Asssert that the new free area is right after the allocated area
        alloc_de&&mand_eq(
          area + to_cell( adjusted_size ),
          the_first_free_area
        );
      }

    }else{
      // The area is too small to split, use it all
      adjusted_size = area_sz;
    }

    // Mark the found free area as busy, for the requested size + the headers
    area_turn_busy( area, klass, sz + 2 * size_of_cell );

    alloc_de&&mand( area_is_busy(     area ) );
    alloc_de&&mand( ! area_is_shared( area ) );
    alloc_de&&mand_neq( area, the_first_free_area );
    alloc_de&&mand( area_is_free( the_first_free_area ) );

    allocate_area_entered = 0;
    area_stat_allocated_bytes += adjusted_size;
    area_stat_allocated_areas += 1;
    alloc_de&&mand_empty_area( area );
    return area;

  }

  // If nothing was found, allocate more memory for the heap and retry
  alloc_de&&mand( area_is_free( the_first_free_area ) );

  // Add some extra cells to avoid too many small allocations
  let extra_cells = 128;

  // Don't forget the cell for the refcount and size headers
  let needed_cells = to_cell( adjusted_size ) + extra_cells + 2;

  const cells = allocate_cells( needed_cells );
  alloc_de&&mand( cells + needed_cells * ONE <= the_next_free_cell );

  alloc_de&&mand( area_is_free( the_first_free_area ) );

  // Skip the refcount and size headers future headers
  area = cells + 2 * ONE;

  // Pretend it is a busy area and then free it to add it to the heap
  area_init_busy( area, 1, needed_cells * size_of_cell );
  alloc_de&&mand( area_is_busy( area ) );
  area_free( area );

  // Fix stats
  area_stat_freed_areas += 1;
  area_stat_freed_bytes += needed_cells * size_of_cell;

  // Retry the allocation, it should work now
  allocate_area_entered = 0;
  const allocated_area = allocate_area( klass, sz );

  // The result should be the newly added area
  alloc_de&&mand_eq( allocated_area, area );
  alloc_de&&mand_eq(
    area + to_cell( adjusted_size ),
    the_first_free_area
  );

  // Defensive
  alloc_de&&mand( area_is_free( the_first_free_area ) );

  // Some monitoring, for debugging and future optimizations
  area_stat_allocated_bytes += adjusted_size;
  area_stat_allocated_areas += 1;
  alloc_de&&mand_empty_area( area );

  return allocated_area;

  /*c{
    #endif
  }*/

}


function area_tag( area : Area ) : Tag {
  alloc_de&&mand( area_is_busy( area ) );
  // The tag (class) is stored in the first header of the area
  return name_of( area - 2 * ONE);
}


function resize_area( area : Area, sz : Size ) : Area {
  alloc_de&&mand( area_is_busy( area ) );
  let ii = area_size( area );
  if( sz <= ii ){
    // ToDo: should split the area and free the extra space
    return area;
  }
  const klass = area_tag( area );
  const new_mem = allocate_area( klass, sz );
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

  alloc_de&&mand( area_is_free( the_first_free_area ) );

  // Void is void is void
  if( area == 0 ){
    return;
  }

  if( area == the_empty_lean ){
    // ToDo: avoid this, it does happen for reasons I don't understand
    return;
  }

  alloc_de&&mand( area_is_busy( area ) );
  const old_count = area_ref_count( area );

  // Just decrement the reference counter if it is not the last reference
  if( old_count != 1 ){
    area_set_ref_count( area, old_count - 1 );
    return;
  }

  // The whole area should be full of zeros, ie cleared
  alloc_de&&mand_empty_area( area );

  // Update some statistics
  const len = area_length( area );
  area_stat_freed_bytes += len * size_of_cell;
  area_stat_freed_areas += 1;

  /*c{
    #ifdef INOX_USE_MALLOC
      // The area was allocated with calloc(), free it
      free( to_ptr( header_of_area( area ) ) );
      if( alloc_de ){
        area_monitor();
      }
      return;
    #endif
  }*/

  /*c{
    #ifndef INOX_USE_MALLOC
  }*/

  // Fix the size to match the length, including the headers
  area_set_size( area, ( len + 2 ) * size_of_cell );

  // If the area is the last allocated one, coalesce it with the rest
  if( area + len * ONE == the_first_free_area ){
    debugger;
    const rest_length = area_length( the_first_free_area );
    const new_length = len + rest_length;
    area_set_size( area, new_length * size_of_cell );
    area_turn_free( area, the_first_free_area );
    // Clear the now useless headers so that long area is totally empty
    alloc_de&&mand_eq(
      header_of_area( the_first_free_area ),
      header_of_area( area ) + len * ONE
    );
    reset( header_of_area( the_first_free_area ) );
    reset( header_of_area( the_first_free_area ) + ONE );
    alloc_de&&mand_empty_area( area );
    the_first_free_area = area;
    alloc_de&&mand( area_is_free( the_first_free_area ) );
    return;
  }

  // If the first free area is right before the area, coalesce them
  if( the_first_free_area + area_length( the_first_free_area ) * ONE == area){
    debugger;
    const rest_length = area_length( the_first_free_area );
    const new_length = len + rest_length;
    area_set_size( the_first_free_area, new_length * size_of_cell );
    // Clear the now useless headers so that long area is totally empty
    alloc_de&&mand_eq(
      header_of_area( the_first_free_area ) + new_length * ONE,
      header_of_area( area ) + len * ONE
    );
    reset( header_of_area( area ) );
    reset( header_of_area( area ) + ONE );
    alloc_de&&mand_empty_area( the_first_free_area );
    return;
  }

  // Add to a "per length" free list if small enough area
  if( len < 10 ){
    area_turn_free( area, all_free_lists_by_area_length[ len ] );
    all_free_lists_by_area_length[ len ] = area;
    area_stat_freed_small_bytes += len * size_of_cell;
    area_stat_freed_small_areas += 1;
    // ToDo: this can degenerate when too many small areas are unused
    // I should from time to time empty the free lists and add areas to the
    // global pool, the older areas first to maximize locality
    // That is what collect_garbage() does, supposedly
    // ToDo: when is collect_garbage() called?
    return;
  }

  // Add area in free list
  // ToDo: insert area in sorted list instead of at the start?
  // I should do this to coalesce adjacent free areas to avoid fragmentation
  area_turn_free( area, the_first_free_area );
  alloc_de&&mand( area_is_free( the_first_free_area ) );
  the_first_free_area = area;
  alloc_de&&mand( area_is_free( area ) );
  if( alloc_de ){
    area_monitor();
  }

  /*c{
    #endif
  }*/
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

  if( ! alloc_de )return true;

  // This helps to debug unbalanced calls to area_lock() and area_free().
  // zero is ok for both reference counter & size because it never happens
  if( area == 0 ){
    return true;
  }

  const header = header_of_area( area );

  // The address must be in the heap
  if( header < the_very_first_cell && ! bootstrapping ){
    FATAL( S()+ "Invalid area, too low, " + C( area ) );
    return false;
  }

  /*c{
    #ifndef INOX_USE_MALLOC
  }*/
  if( header >= the_next_free_cell ){
    FATAL( S()+ "Invalid area, too high, " + C( area ) );
    return false;
  }
  /*c{
    #endif
  }*/

  // The address must be aligned on a cell boundary
  if( area % ( size_of_cell / size_of_word ) != 0 ){
    FATAL( S()+ "Invalid area, not aligned on a cell boundary, " + C( area ) );
    return false;
  }

  // When busy
  if( name_of( header ) != the_tag_for_dynamic_next_area ){

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

    // When one of the 3 most significant bits is set, that's a type id probably
    if( reference_counter >= ( 1 << 29 ) ){
      // It also could be a very big reference counter, but that's unlikely
      const type = unpack_type( reference_counter );
      FATAL( S()+ "Invalid area, bad counter, " + N( type ) + " " + C( area ) );
      return false;
    }

  }else if( name_of( header ) == the_tag_for_dynamic_next_area ){

    // The value should be the integer address of a next free area, or zero
    alloc_de&&mand_eq( type_of( header ), type_void );
    if( area_is_safe_entered == area ){
      debugger;
      area_is_safe_entered = 0;
      area_is_safe_entered_nth = 0;
      FATAL( S()+ "Invalid free area, loop, " + C( area ) );
      return false;
    }

    // Slow check of the whole free list, only in slow debugging mode
    if( step_de || verbose_stack_de ){

      // Limit the amount of recursion when walking the list of free areas
      // ToDo: the limit should be configurable at compile time. On some CPUs it
      // bombs at 377
      if( area_is_safe_entered_nth >= 10 ){
        // Just walk the list instead
        let nxt = area;
        let tmp;
        while( true ){
          tmp = value_of( header_of_area( nxt ) );
          if( tmp == -1
          ||  tmp == 9
          ){
            debugger;
          }
          nxt = tmp;
          if( nxt == 0 )break;
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
        if( ! area_is_safe( next ) ){
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

    }

  }else{
    FATAL( S()+ "Invalid area, bad header, " + N( header ) + " " + C( area ) );
    return false;
  }

  // The second header must be named the_tag_for_dynamic_area_size
  if( name_of( header + 1 * ONE ) != the_tag_for_dynamic_area_size ){
    FATAL( S()+ "Invalid area, bad size header, " + C( area ) );
    return false;
  }

  // It must be an integer
  if( type_of( header + 1 * ONE ) != type_integer ){
    FATAL( S()+ "Invalid area, bad size header type, " + C( area ) );
    return false;
  }

  // The size must be at least the size of the headers
  const size = value_of( header + 1 * ONE );
  if( size < 2 * size_of_cell ){
    FATAL( S()+ "Invalid area, too small, " + N( size ) + " " + C( area ) );
    return false;
  }

  // When one of the 3 most significant bits is set, that's a type id probably
  if( size >= ( 1 << 29 ) ){
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
  if( ! bootstrapping
  && size > ( the_next_free_cell - the_very_first_cell ) * size_of_cell
  ){
    FATAL( S()+ "Invalid size for area " + N( size ) + " " + C( area ) );
    return false;
  }

  return true;
}


function area_test_suite(){
  // This was generated by copilot, it is very insufficent
  const the_area = allocate_area( 1, 10 );
  de&&mand( area_is_busy( the_area ) );
  area_free( the_area );
  //c/ #ifndef INOX_USE_MALLOC
  de&&mand( area_is_free( the_area ) );
  //c/ #endif
  const the_area2 = allocate_area( 1, 10 );
  de&&mand( area_is_busy( the_area2 ) );
  area_lock( the_area2 );
  de&&mand( area_is_busy( the_area2 ) );
  area_free( the_area2 );
  de&&mand( area_is_busy( the_area2 ) );
  area_free( the_area2 );
  //c/ #ifndef INOX_USE_MALLOC
  de&&mand( area_is_free( the_area ) );
  //c/ #endif
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


function clear_unshared_area( area : Area ){

  de&&mand( ! area_is_shared( area ) );

  // ToDo: optimize this, using a table of functions?
  // ToDo: asynchronomous destruction in a separate thread?
  // To keep the "destructor" logic, some flag would have to be set
  // to mark the area as being an area that needs that logic.

  const class_tag = type_of( area );

  switch( class_tag ){
    case tag_box :
      box_free( area );
      break;
    case tag_text:
      text_free( area );
      break;
    case tag_range:
      range_free( area );
      break;
    case tag_proxy:
      proxy_free( area );
      break;
    default:
      object_free( area );
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

  // Cell is either a text, a reference to an object, a range or a proxy
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
  clear_unshared_area( area );

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
  clear_unshared_area( area);

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
 *    - the tag cell,   a 29 bits address
 *    - the string,     a Text in C++, a string in TypeScript
 *    - the primitive,  a void (fn)( void ) in C++, a function in TypeScript
 *    - the definition, a 29 bits address of the first cell of the definition
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
// In TypeScript, those are strings, in C++, it is LearnString objects
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

  // See tables below, from "void" to ...
  all_symbol_cells_length = 18;

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
      "void",       // 0 - the 8 first symbols must match the type ids
      "boolean",    // 1
      "integer",    // 2
      "float",      // 3
      "tag",        // 4
      "verb",       // 5
      "primitive",  // 6
      "reference",  // 7
      "invalid",    // 8 - room for future types
      "_dynsz",     // 9 - dynamic area allocator related
      "_dynxt",     // 10 - dynamic area allocator related
      "list",       // 11
      "text",       // 12
      "stack",      // 13
      "proxy",      // 14
      "flow",       // 15
      "range",      // 16
      "box"         // 17

    ];
    // ToDo: I should use a stack for that too
    all_primitives  = [];
    all_definitions = [];
    for( ii = 0 ; ii < all_symbol_cells_capacity ; ii++ ){
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
    ii = 0;
    all_symbol_texts[ ii++ ] = "void";
    all_symbol_texts[ ii++ ] = "boolean";
    all_symbol_texts[ ii++ ] = "integer";
    all_symbol_texts[ ii++ ] = "float";
    all_symbol_texts[ ii++ ] = "tag";
    all_symbol_texts[ ii++ ] = "verb";
    all_symbol_texts[ ii++ ] = "primitive";
    all_symbol_texts[ ii++ ] = "reference";
    all_symbol_texts[ ii++ ] = "invalid";
    all_symbol_texts[ ii++ ] = "_dynsz";
    all_symbol_texts[ ii++ ] = "_dynxt";
    all_symbol_texts[ ii++ ] = "list";
    all_symbol_texts[ ii++ ] = "text";
    all_symbol_texts[ ii++ ] = "stack";
    all_symbol_texts[ ii++ ] = "proxy";
    all_symbol_texts[ ii++ ] = "flow";
    all_symbol_texts[ ii++ ] = "range";
    all_symbol_texts[ ii++ ] = "box";
    de&&mand( ii == all_symbol_cells_length );
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
  de&&mand_eq( tag_list, 11 );
  de&&mand( teq( all_symbol_texts[ tag_list ], "list" ) );
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
    auto_symbol_text = tag_as_text( symbol_tag );
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


function tag_as_text( t : Tag ) : Text {
// Return the string value of a tag
  de&&mand( tag_is_valid( t ) );
  if( ! tag_is_valid( t ) ){
    return S()+ "invalid-tag-" + N( t );
  }
  return all_symbol_texts[ t ];
}


function symbol_as_text( c : Cell ) : Text {
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
    if( teq( symbol_as_text( all_symbol_cells + ii * ONE ), name ) ){
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
  // ToDo: error if tag is not a primitive
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

const tag_extension_length = tag( "extension-length" );

function stack_allocate( len : Length ) : Cell {
// Allocate a stack of length len
  let area;
  // If stack is extensible, ie has an initial length of 0
  if( len <= 0 ){
    area = allocate_area( tag_stack, 1 * size_of_cell );
    // Then first cell is a reference to some other stack that may change
    set( area, type_reference, tag_stack, stack_allocate( 1 ) );
  // If stack isn't extensible, then first cell is the length of the stack
  }else{
    area = allocate_area( tag_stack, ( len + 1 ) * size_of_cell );
    set( area, type_integer, tag_extension_length, 0 );
    de&&mand_eq( stack_length( area ), 0 );
  }
  de&&mand_eq( stack_length( area ), 0 );
  // ToDo: should return a + ONE maybe, ie skip the header first cell?
  return area;
}


function stack_preallocate( len : Length ) : Cell {
// Allocate an extensible stack with an initial capacity
  const a = allocate_area( tag_stack, 1 * size_of_cell );
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
  let ii = 0;
  while( ii < len ){
    stack_push( stk, c + ii * ONE );
    ii += 1;
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
  let ii = 0;
  while( ii < len ){
    stack_push_copy( stk, c + ii * ONE );
    ii += 1;
  }
}


function stack_pop( a_stack : Area ) : Cell {
// Pop a cell from a stack, just returning it's address
  const index_of_last_item = stack_length( a_stack ) - 1;
  if( check_de && index_of_last_item < 0 ){
    FATAL( "stack_pop: stack is empty" );
  }
  const c = stack_at( a_stack, index_of_last_item );
  // Reduce the length of the stack by 1
  stack_set_length( a_stack, index_of_last_item );
  return c;
}


function stack_pop_nice( stk : Area ) : Cell {
// Pop a cell from a stack, just returning it's address, 0 if empty
  const index_of_last_item = stack_length( stk ) - 1;
  if( index_of_last_item < 0 ){
    return 0;
  }
  const c = stack_at( stk, index_of_last_item );
  // Reduce the length of the stack by 1
  stack_set_length( stk, index_of_last_item );
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


function stack_duplicate( stk : Area ) : Cell {
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
  let auto_ = S();
  // ToDo: a JSON style format, TLV probably
  auto_ += "[ ";
  let ii;
  for( ii = 0 ; ii < len ; ii++ ){
    auto_ += dump( stack_at( stk, ii ) ) + " ";
  }
  auto_ += "]";
  return auto_;
}


function stack_split_dump( stk : Area, nth : Index ) : Text {
// Dump a stack, with a newline every nth item
  // "[ ]" is the empty stack
  const len = stack_length( stk );
  let auto_ = S();
  // ToDo: a JSON style format, TLV probably
  auto_ += "[ ";
  let ii;
  for( ii = 0 ; ii < len ; ii++ ){
    if( ii % nth == 0 ){
      auto_ += "\n";
    }
    auto_ += short_dump( stack_at( stk, ii ) ) + " ";
  }
  auto_ += "]";
  return auto_;
}


function stack_lookup_by_name( stk : Area, n : ConstText ) : Cell {
// Lookup a cell in a stack by name
  const len = stack_length( stk );
  // Starting from the end of the stack, look for the name
  let ii;
  for( ii = len ; ii > 0 ; ii-- ){
    const c = stack_at( stk, ii - 1 );
    if( teq( n, tag_as_text( name_of( c ) ) ) ){
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
    if( teq( n, tag_as_text( name_of( c ) ) ) ){
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
    + tag_as_text( tag )
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
    if( teq( n, tag_as_text( name_of( c ) ) ) ){
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

/**/  const  boolean_false = 0;
//c/ #define boolean_false   0

/**/  const  boolean_true    = 1;
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
 *  representation that is required, it is the name of the tag that
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
  return symbol_lookup( n ) != 0;
}


function tag_is_valid( id : Tag ) : boolean {
// True if tag was internalized
  // <= vs < because register_symbol() calls this function before incrementing
  const is_valid = ( id >= 0 && id <= all_symbol_cells_length );
  if( ! is_valid ){
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


const the_void_cell = 0;


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
  //c/ *( ( Float * ) ( c << 3 ) ) = v;
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

function set_reference_cell( c : Cell, v : Cell ){
  de&&mand( area_is_busy( v ) );
  set( c, type_reference, area_tag( v ), v );
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
  if( tnone( txt ) ){
    alloc_de&&mand( area_is_busy( the_empty_lean ) );
    // ToDo: precompute info_text_text and use init_cell()
    set( c, type_reference, tag_text, the_empty_lean );
    // copy_cell( the_empty_text_cell, c );
    return;
  }
  /**/ const str = lean_str_new_from_native( txt );
  /*c{
    Cell str = to_cell( txt.c_str() );
    lean_str_lock( str );
  }*/
  set( c, type_reference, tag_text, str );
  de&&mand( cell_looks_safe( c ) );

  // ToDo: handle utf-8
  /*ts{*/
    if( de ){
      const txt1 = cell_as_text( c );
      if( txt != txt1 ){
        if( txt.length != txt1.length ){
          debugger;
          let ii;
          for( ii = 0 ; ii < txt.length ; ii++ ){
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
        cell_as_text( c );
      }
    }
  /*}*/

  de&&mand( teq( cell_as_text( c ), txt ) );
}


function text_free( oid : Area ){
  lean_str_free( oid );
}


/* -----------------------------------------------------------------------------
 *  Some global cells
 */

function init_the_empty_text_cell() : Index {
  the_empty_text_cell = allocate_cell();
  // ToDo: precompute the_empty_lean to avoid a test in lean_new_empty()
  set(
    the_empty_text_cell,
    type_reference,
    tag( "the-empty-text" ),
    the_empty_lean
  );
  // It's only now that testing the area allocator is possible.
  area_test_suite();
  return 1;
}
let init_the_empty_text_cell_done = init_the_empty_text_cell();


// Now it is possible to do some more smoke tests

function lean_string_test() : Index {
  // Test the string functions
  const str1 = lean_str_new_from_native( "Hello" );
  const str2 = lean_str_new_from_native( "World" );
  const str3 = lean_str_new_from_strcat( str1, str2 );
  const str4 = lean_str_new_from_native( "HelloWorld" );
  if( lean_str_cmp( str3, str4 ) != 0 ){
    FATAL( "lean_str_cmp failed" );
    return 0;
  }
  if( lean_str_index( str3, str1 ) != 0 ){
    FATAL( "lean_str_index failed" );
    return 0;
  }
  if( lean_str_index( str3, str2 ) != 5 ){
    FATAL( "lean_str_index failed" );
    return 0;
  }
  const str5 = lean_substr( str3, 0, 5 );
  if( lean_str_cmp( str5, str1 ) != 0 ){
    FATAL( "lean_substr failed" );
    return 0;
  }
  lean_str_free( str1 );
  lean_str_free( str2 );
  lean_str_free( str3 );
  lean_str_free( str4 );
  lean_str_free( str5 );
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

  // tmid(), with negative indices
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
  // the reference itself is a 29 bits address. The 3 bits left
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
  // Another solution is to push on the control stack the values
  // to be cleared and let the runner clear them.

  // Start from the end, lifo style
  let ii = object_length( area );
  while( ii > 0 ){
    ii -= 1;
    clear( area + ii * ONE );
  }
  area_free( area );

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
  // In C++, the object points to a dynamically allocated area
  /*c{
    int area = to_cell( object );
    area_lock( area );
  }*/
  // In TypeScript there is map between the id and the native object
  /*ts{*/
    const area = allocate_area( tag_proxy, size_of_cell );
    all_proxied_objects_by_id.set( area, object );
  /*}*/
  return area;
}


function set_proxy_cell( c : Cell, area : Area ){
  alloc_de&&mand( area_is_busy( area ) );
  set(
    c,
    type_reference,
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


function proxy_as_text( area : Area ) : Text {
  alloc_de&&mand( area_is_busy( area ) );
  // Some special case 0 produces the empty text.
  if( ! area )return no_text;
  /*ts{*/
    if( ! all_proxied_objects_by_id.has( area ) ){
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
  if( ! tag_exists( n ) ){
    return false;
  }
  const verb_tag = tag( n );
  // Then check if the verb was defined
  return definition_exists( verb_tag );
}


function find_definition_by_name( n : TxtC ) : Cell {
// Find a verb in the dictionary
  // Check tag existence first
  if( ! tag_exists( n ) ){
    return the_default_verb_definition;
  }
  const verb_tag = tag( n );
  const d = get_definition( verb_tag );
  if( d == 0 ){
    return the_default_verb_definition;
  }
  return d;
}


function definition_of( id : Index  ) : Cell {
// Given a verb, as a tag, return the address of its definition
  const def = find_definition( id );
  if( def != get_definition( id ) ){
    if( tag_is_valid( id ) ){
      const auto_ = tag_as_text( id );
      debugger;
    }else{
      debugger;
    }
    get_definition( id );
    find_definition( id );
  }
  de&&mand_eq( def, get_definition( id ) );
  return def;
}

function definition_by_name( n : ConstText ) : Cell {
  if( ! tag_exists( n ) ){
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
    + "Not a definition: " + C( n ) + " " + tag_as_text( n )
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


function find_method_definition( class_tag : Tag, method_tag : Tag ) : Cell {
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
  const fullname = tag_as_text( class_tag ) + "." + tag_as_text( method_tag );
  const def = find_definition_by_name( fullname );
  if( def == the_default_verb_definition ){
    return 0;
  }
  update_method_cache( class_tag, method_tag, def );
  return def;

}


function update_method_cache( klass : Tag, method : Tag, def : Cell ){
// Register a method in the method dictionary
  // ToDo: better hash function
  const hashcode = ( klass << 13 ) + method;
  class_cache.set(      hashcode, klass );
  method_cache.set(     hashcode, method );
  definition_cache.set( hashcode, def );
}


const tag_all = tag( "all" );

function clear_method_cache( klass : Tag, method : Tag ){
// Remove a method from the method dictionary

  // Special case to remove multiple methods
  if( method == tag_all ){

    // For all classes
    if( klass == tag_all ){
      class_cache.clear();
      method_cache.clear();
      definition_cache.clear();

    // For a specific class
    }else{
      // ToDo: don't clear all
      class_cache.clear();
      method_cache.clear();
      definition_cache.clear();
    }
    return;
  }

  // Special case to remove a method from all classes
  if( klass == tag_all ){
    // ToDo: don't clear all
    class_cache.clear();
    method_cache.clear();
    definition_cache.clear();
    return;
  }

  // Normal case to remove a single method in a single class
  const hashcode = ( klass << 13 ) + method;
  class_cache.delete(      hashcode );
  method_cache.delete(     hashcode );
  definition_cache.delete( hashcode );

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
  auto class_name  = tag_as_text( class_tag );
  auto method_name = tag_as_text( method_tag );
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


function register_verb_definition( verb_tag : Tag, def : Cell ){
// Define a verb
  // There is a header is the previous cell, for length & flags.
  // The definition is an array of verbs with literals, primitive ids and
  // verb ids, aka a block. See run() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the verb.

  // Check the header
  de&&mand_cell_name( def - 1 * ONE, verb_tag );
  de&&mand_cell_type( def - 1 * ONE, type_integer );

  // Register the verb in the global symbol table
  register_definition( verb_tag, def );

  // Detect cccc.mmmmm verbs, ie method verbs
  const auto_fullname = tag_as_text( verb_tag );
  const dot_position  = tidx( auto_fullname, "." );
  if( dot_position > 0 ){
    const auto_class_name  = tcut( auto_fullname, dot_position );
    const auto_method_name = tbut( auto_fullname, dot_position + 1 );
    if( tsome( auto_method_name ) ){
      const class_tag  = tag( auto_class_name );
      const method_tag = tag( auto_method_name );
      update_method_cache( class_tag, method_tag, def );
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
 *  a-list? - true if TOS is a list
 */

/*
 *  nil? - true if TOS is an empty list
 */


/*
 *  list - make a new list, empty
 */


/*
 *  list.cons - make a new list, with TOS as head and NOS as tail
 */


/*
 *  list.car - get the head of a list
 */


/*
 *  list.head -
 */


/*
 *  list.tail -
 */


/*
 *  list.cdr -
 */


/*
 *  list.set-car -
 */


/*
 *  list.set-cdr -
 */


/*
 *  list.length - number of elements in a list
 */


/*
 *  list.append - append two lists
 */


/*
 *  list.reverse - reverse a list
 */


/*
 *  list.last -
 */


/*
 *  list.nth -
 */


/*
 *  list.member? -
 */


/*
 *  list.copy -
 */


/*
 *  list.= - true if two lists have the same elements in the same order
 */


/* -----------------------------------------------------------------------------
 *  Some types are reference types, some are value types
 */

// ToDo: make verb 0 the void verb and get rid of type_primitive?
// ToDo: get rid of type_tag and use type_verb instead?
// As a result there would be only two types of types: verbs & literals


function is_a_reference_type( t : Type ) : boolean {
  return t == type_reference;
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
  let auto_ = S();
  auto_ += "Bad type, "    + N( actual )   + "/" + type_as_text( actual   );
  auto_ += " vs expected " + N( expected ) + "/" + type_as_text( expected );
  bug( auto_ );
  return mand_eq( actual, expected );
}


function mand_name( actual : Index, expected : Index ) : boolean {
  if( actual == expected )return true;
  if( bootstrapping )return mand_eq( actual, expected );
  let auto_ = S();
  auto_ += "Bad name, "    + N( actual )   + " /" + tag_as_text( actual   );
  auto_ += " vs expected " + N( expected ) + " /" + tag_as_text( expected );
  bug( auto_ );
  return mand_eq( actual, expected );
}


function mand_cell_type( c : Cell, type_id : Type ) : boolean {
// Assert that the type of a cell is the expected type
  if( c <= 0 ){
    return mand2( false, S() + "Bad cell " + C( c ) );
  }
  const actual_type = type_of( c );
  if( actual_type == type_id )return true;
  let auto_ = S();
  auto_ += "Bad type for cell " + C( c );
  auto_ += ", expected " + N( type_id )
  + "/" + type_as_text( type_id );
  auto_ += " vs actual " + N( actual_type )
  + "/" + type_as_text( actual_type );
  bug( auto_ );
  // ToDo: should raise a type error
  return mand_type( type_of( c ), type_id );
}


function mand_tag( c : Cell ) : boolean {
  return mand_cell_type( c, type_tag );
}


function mand_integer( c : Cell ) : boolean {
  return mand( type_of( c ) <= type_integer );
  // return mand_cell_type( c, type_integer );
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
  let auto_ = S();
  auto_ += "Bad name for cell " + C( c );
  auto_ += ", expected " + N( n )
  + " /" + tag_as_text( n );
  auto_ += " vs actual " + N( actual_name )
  + " /" + tag_as_text( actual_name );
  bug( auto_ );
  // ToDo: should raise a type error
  return mand_name( name_of( c ), n );
}


function mand_void_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the integer type
  return mand_cell_type( c, type_void );
}


function mand_boolean_cell( c : Cell ) : boolean {
// Assert that the type of a cell is compatible with the boolean type
  return mand_cell_type( c, type_boolean );
}


function mand_tag_cell( cell  : Cell ) : boolean {
// Assert that the type of a cell is the tag type
  return mand_cell_type( cell, type_tag );
}


function mand_verb_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the integer type
  return mand_cell_type( c, type_verb );
}


function mand_primitive_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the primitive type
  return mand_cell_type( c, type_primitive );
}


function mand_reference_cell( c : Cell ) : boolean {
// Assert that the type of a cell is the reference type
  return mand_cell_type( c, type_reference );
}


function mand_text_cell( cell : Cell ) : boolean {
// Assert that the type of a cell is the text type
  return mand_cell_type( cell, type_reference )
  && area_tag( value_of( cell ) ) == tag_text;
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
  return eat_raw_value( pop() );
}


function pop_value() : Value {
// Like eat_value() but pop the cell from the stack
  return eat_value( pop() );
}


function pop_block() : Cell {
// Pop a block address from the stack
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
  const n = name_of( TOS );
  raw_drop();
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
  const auto_ = cell_as_text( TOS );
  drop();
  return auto_;
}


function eat_ip( c : Cell ) : Cell {
// Like eat_value() but check that the cell is an ip
  check_de&&mand_cell_type( c, type_ip );
  return eat_raw_value( c );
}


function pop_ip(){
// Pop IP from the control stack
  IP = eat_ip( CSP );
  CSP -= ONE;
}


function drop(){
// Drop the top of the data stack
  clear( pop() );
}


function raw_drop(){
// Drop the top of the data stack, assuming it is not a reference
  reset( pop() );
}


function drop_control(){
// Drop the top of the control stack
  clear( CSP );
  CSP -= ONE;
}


function raw_drop_control(){
// Drop the top of the control stack, assuming it is not a reference
  reset( CSP );
  CSP -= ONE;
}


/* ----------------------------------------------------------------------------
 *  Helpers to push values on the stack
 */

function push_text( t : ConstText ){
  push();
  set_text_cell( TOS, t );
}


function push_tag( t : Tag ){
  push();
  set_tag_cell( TOS, t );
}


function push_verb( t : Tag ){
  push();
  set_verb_cell( TOS, t );
}


function push_integer( i : Index ){
  push();
  set_integer_cell( TOS, i );
}


function push_boolean( b : boolean ){
  push();
  set_boolean_cell( TOS, b ? 1 : 0 );
}


function push_true(){
  push();
  set_boolean_cell( TOS, 1 );
}


function push_false(){
  push();
  set_boolean_cell( TOS, 0 );
}


function push_proxy( proxy : Index ){
  push();
  set_proxy_cell( TOS, proxy );
}


function push_reference( c : Cell ){
  push();
  set_reference_cell( TOS, c );
}

/* ----------------------------------------------------------------------------
 *  Helpers to push values on the control stack.
 *  Schedule what to do next when current verb is done, when it "returns".
 */

function defer( name : Tag, def : Cell ){
// Register a defered "jump" style of verb invocation in the control stack
  CSP += ONE;
  set( CSP, type_verb, name, def );
}


function call( name : Tag, def : Cell ){
// Register a defered "call" style of verb invocation in the control stack
  // Call is defer + jump
  CSP += ONE;
  set( CSP, type_verb, name, IP );
  IP = def;
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
        // There is an exception, see the hack in make.constant
        count_voids += delta_void - 1;
        trace( "void - " + N( delta_void ) + " cells" );
      }else{
        trace( "void" );
      }
    }

    // ToDo: count heap cells, busy, free, total, etc.

    if( type_of( c ) == type_primitive ){
      trace( "" + C( c ) + ": " + dump( c )
      + " - " + inox_machine_code_cell_as_text( c ) );
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


const tag_l9_task = tag( "l9-task" );


function make_actor( ip : Cell ) : Cell {

  // Allocate an object with 7 slots
  let actor = stack_allocate( 7 );

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
  stack_push( actor, the_tmp_cell );   // slot 0, /data-stack

  set( the_tmp_cell, type_reference, tag_control_stack, cstk );
  stack_push( actor, the_tmp_cell );   // slot 1, /control-stack

  set( the_tmp_cell, type_integer, tag_ip, ip );
  stack_push( actor, the_tmp_cell );   // slot 2, /ip

  // The 3 next slots are to save the CPU context: ip, tos, csp
  set( the_tmp_cell, type_integer, tag_ip, ip );
  stack_push( actor, the_tmp_cell );   // slot 3, /ip

  set( the_tmp_cell, type_integer, tag_tos, dstk );
  stack_push( actor, the_tmp_cell );   // slot 4, /tos

  set( the_tmp_cell, type_integer, tag_csp, cstk );
  stack_push( actor, the_tmp_cell );   // slot 5, /csp

  // There is a low level l9-task for each actor
  set( the_tmp_cell, type_void, tag_l9_task, 0 );
  stack_push( actor, the_tmp_cell );   // slot 6, /l9-task

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

let is_in_ts_only_code = false;
let is_in_c_only_code  = false;

let all_c_function_declarations = "";

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
  // Collect all such declarations
  if( ! is_in_ts_only_code ){
    all_c_function_declarations += tcut( new_s, -1 ) + ";\n";
  }
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

  let ii   = 0;
  let line = "";
  let len  = ts.length;

  // Hack to avoid interferences with comments in this function itself
  let begin = "/" + "*";
  let end   = "*" + "/";

  let last_ii       = -1;
  let blank_lines   = 0;
  let comment_lines = 0;
  let ts_only_lines = 0;
  let c_only_lines  = 0;
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

  function count_line(){
    if( is_in_ts_only_code ){
      ts_only_lines += 1;
    }
    if( is_in_c_only_code ){
      c_only_lines += 1;
    }
  }

  // For each line
  let comment_start = -1;
  for( ii = 0 ; ii < len ; ii++ ){

    line = ts[ ii ];

    // Skip empty lines
    if( tnone( line ) ){
      blank_lines = blank_lines + 1;
      c_source += line + "\n";
      count_line();
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
      count_line();
      continue;
    }

    // / * * /, rest of line is removed, it is TypeScript specific code
    if( replace( /^\s*\/\*\*\/(.*)$/, " //ts/ $1 " ) ){
      de&&mand( ! is_in_ts_only_code );
      de&&mand( ! is_in_c_only_code  );
      ts_only_lines += 1;
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
      count_line();
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
      count_line();
      continue;
    }

    // Leave line untouched if it is a true mutli line comment, not a xx{
    if( line == begin
    || (   line.match( /^\s*\/\* / )
      && ! line.match( /^\s*\/\*\S/ )
    ) ){
      comment_start = ii;
      if( targets_preserve_comments ){
        c_source += line + " C++\n";
      }else{
        c_source += "\n";
      }
      comment_lines = comment_lines + 1;
      count_line();
      continue;
    }

    // Skip comment lines?
    if( ! targets_preserve_comments && comment_start != -1 ){
      c_source += "\n";
      comment_lines = comment_lines + 1;
      count_line();
      continue;
    }

    // Else, do some replacements

    // Turn const INOX_XXX_XXX into #define INOX_XXX_XXX
    replace(  /^const +INOX_([A-Z0-9_]+) += +(.+);(.*)$/,
      "#define INOX_$1 $2$3" );

    // Turn numerical constants into #define
    replace( /^(\s*)const +([a-zA-Z0-9_]+) += +([0-9]+);$/,
    "$1#define $2 $3" );

    // Turn "let auto_" into C++ local automatic variables
    // This takes advantage of C++ type inference
    replace( /^(\s+) let +auto_/, "$1 auto auto_" );

    // Idem for "const auto_", turned into C++ local automatic variables
    replace( /^(\s+) const +auto_/, "$1 auto auto_" );

    // Turn "let text" into C++ local automatic variables
    // This takes advantage of C++ type inference
    replace( /^(\s+) let +text/, "$1 auto text" );

    // Idem for "const text", turned into C++ local automatic variables
    replace( /^(\s+) const +text/, "$1 auto text" );

    // Turn " let" into C++ i32 local variables
    replace( /^(\s+) let /, "$1 i32 " );

    // Idem with " const", turned into i32 C++ local variables
    replace( /^(\s+) const /, "$1 i32 " );

    // Turn global "let" and "const" into C++ global static i32 variables
    replace( /^let /,   "static i32 " );
    replace( /^const /, "static i32 " );

    // //c/ lines are C++ specific lines
    replace(
      /^(\s*)\/\/c\/ (.*)$/,
      function( m, p1, p2 ){
        de&&mand( ! is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        c_only_lines += 1;
        return p1 + p2;
      }
    );

    // start of TypeScript version, ie / *ts{* /
    replace(
      begin + "ts{" + end,
      function(){
        de&&mand( ! is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        is_in_ts_only_code = true;
        return " " + begin + "ts{";
      }
    );

    // start of C++ version, ie / *c{
    replace(
      begin + "c{",
      function(){
        de&&mand( ! is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        is_in_c_only_code = true;
        return " " + begin + "c{" + end;
      }
    );

    // end of TypeScript, start of C++, ie / *}{
    replace(
      begin + "}{",
      function(){
        de&&mand(   is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        is_in_c_only_code  = true;
        return " //" + begin + "}{" + end;
      }
    );

    // end of TypeScript, ie / *}
    replace(
      begin + "}",
      function(){
        de&&mand(   is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        is_in_ts_only_code = false;
        return "//}";
      }
    );

    // end of C++, ie }* /
    replace(
      "}" + end,
      function(){
        de&&mand( ! is_in_ts_only_code );
        de&&mand(   is_in_c_only_code  );
        is_in_c_only_code = false;
        return "//}";
      }
    );

    // Collect all primitives
    replace( /^\s*primitive\(\s+"(\S+)",\s+(\w+)\s*\);$/,
      function( match, p1, p2, p3 ){
        de&&mand( ! is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    );
    replace( /^\s*operator_primitive\(\s+".+",\s+(\w+)\s*\);$/,
      function( match, p1, p2, p3 ){
        de&&mand( ! is_in_ts_only_code );
        de&&mand( ! is_in_c_only_code  );
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    );
    replace( /^\s*immediate_primitive\(\s+"(\S+)",\s+(\w+)\s*\);$/,
    function( match, p1, p2, p3 ){
      de&&mand( ! is_in_ts_only_code );
      de&&mand( ! is_in_c_only_code  );
      all_primitive_declarations += "\n" + match;
      return "// postponed: " + match;
    } );

    // Also collect the other "postponed" initializations, / *P* / marked
    replace(
      /^\s*\/\*P\*\/.*$/,
      function( match, p1, p2, p3 ){
        all_primitive_declarations += "\n" + match;
        return "// postponed: " + match;
      }
    );

    // Generate the void xx( void ) C++ declarations for primitives
    replace( /^function +(primitive_\w+)\(\)\{$/, "void $1( void ){ // ts $_" );

    // Generate the C++ declarations for other functions
    replace( /^(function +\w+\(.*\).*\{)$/, build_c_function_declaration );

    count_line();

    c_source += line + "\n";

  }

  // Inject all C function declarations, ie they become "forward" declarations
  // ToDo: fix __LINE__ usage, until then, I manually inject the declarations
  c_source = c_source.replace(
    "ALL_C_FUNCTION_" + "DECLARATIONS",
    "#define SAVE_LINE __LINE__\n"
    + all_c_function_declarations
    + "#line SAVE_LINE\n"
  );

  // Inject the primitive declarations into init_globals(), see below
  c_source = c_source.replace(
    "ALL_PRIMITIVE_" + "DECLARATIONS",
    all_primitive_declarations
  );

  // Done, write the C++ source code
  require( "fs" ).writeFileSync( "builds/inox.cpp", c_source, "utf8" );

  const lines_of_code = len - ( comment_lines + blank_lines );

  console.log(
    "\nCode generated,\n  "
    + len + " total lines, including\n  "
    + comment_lines + " comment lines,\n  "
    + blank_lines   + " blank lines,\n  "
    + ( blank_lines + comment_lines ) + " blank or comment lines,\n  "
    + lines_of_code + " code lines,\n  "
    + ts_only_lines + " TypeScript specific lines,\n  "
    + c_only_lines  + " C++ specific lines,\n  "
    + ( lines_of_code - ts_only_lines - c_only_lines ) + " agnostic lines,\n  "
    + nchanges      + " C++ changes.\n\n  "
    + area_stat_allocated_areas + " total allocated areas,\n  "
    + area_stat_allocated_bytes + " total allocated bytes,\n  "
    + mem8.length   + " bytes in mem8,\n  "
    + mem64.length  + " cells\n  "
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
  let html_source = "<html>"
  + "<head><title>Inox primitives</title></head>"
  + "<body>";

  // Make a table of all primitives
  html_source += "\n<table border=1>\n<tr><th>Primitive</th><th>Code</th></tr>";

  // Scan the TypeScript source code, collecting all primitives
  let found;
  let count_primitives = 0;
  for( ii = 0 ; ii < ts.length ; ii++ ){
    line = ts[ ii ];
    // The line pattern is "  * name - brief description"
    found = line.match( /^  *\*  ([^\( ]+) - (.*)$/ );
    if( found ){
      count_primitives++;
      let name  = found[ 1 ];
      let brief = found[ 2 ];
      html_source += "\n<tr><td>" + name + "</td><td>" + brief + "</td></tr>";
    }
  }

  // Close the table and html body/file
  html_source += "\n</table>"
  + "\n<p>Found " + count_primitives + " primitives.</p>"
  + "</body>"
  + "</html>\n";

  // Done, write the html source code
  require( "fs" ).writeFileSync( "builds/inox.html", html_source, "utf8" );

  // Build the Markdown help file that lists all primitives
  let md_source = "# Inox primitives\n\n";

  // Make a table of all primitives
  md_source += "\n| Primitive | Code |\n| --- | --- |";

  // Scan the TypeScript source code, collecting all primitives
  for( ii = 0 ; ii < ts.length ; ii++ ){
    line = ts[ ii ];
    // The line pattern is "  * name - brief description"
    found = line.match( /^  *\*  ([^\( ]+) - (.*)$/ );
    if( found ){
      let name  = found[ 1 ];
      let brief = found[ 2 ];
      md_source += "\n| " + name + " | " + brief + " |";
    }
  }

  // Add a final new line
  md_source += "\n";

  // Done, write the Markdown source code
  require( "fs" ).writeFileSync( "builds/inox.md", md_source, "utf8" );

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
  reset( c );
  de&&mand( type_of(  c ) == type_void );
  de&&mand( name_of(  c ) == 0         );
  de&&mand( value_of( c ) == 0         );
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

  // Add machine code to invoke the primitive, see run()
  set( def + 0 * ONE, type_primitive, name_id, 0 );

  // Add "return", 0 actually.
  set_return_cell( def + 1 * ONE );

  register_verb_definition( name_id, def );
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

  nde&&bug( text_of_verb_definition( name_id ) );

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
  push();
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
    + " from " + C( name_of( CSP ) ) + "/" + tag_as_text( name_of( CSP ) )
  );
  debugger;
  pop_ip();
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

/*
 *  return-if - conditionnal return
 */

function primitive_return_if(){
  if( pop_boolean() ){
    pop_ip();
  }
}
primitive( "return-if", primitive_return_if );


/*
 *  return-unless - conditionnal return
 */

function primitive_return_unless(){
  if( ! pop_boolean() ){
    pop_ip();
  }
}
primitive( "return-unless", primitive_return_if );


function trace_context( msg : TxtC ){
  let auto_ = "";
  if( tsome( msg ) ){
    auto_ = S() + "\n" + msg;
  }
  bug( S()
    + auto_
    + "\n" + stacks_dump()
    + "\nIP: " + inox_machine_code_cell_as_text( IP ) + "\n"
  );
}


/*
 *  actor - push a reference to the current actor
 */

/**/ function set_tos_name( n : Tag ){ set_name( TOS, n ); }
//c/ #define  set_tos_name( n       )  set_name( TOS, n )


function primitive_actor(){
  push_integer( ACTOR ); // ToDo: push_reference()?
  set_tos_name( tag_actor );
}
primitive( "actor", primitive_actor );


/*
 *  l9 - push a reference to the l9 task of the current actor
 */

function primitive_l9(){
  // The l9 task property is the 7th property of the actor
  push();
  copy_cell( ACTOR + 6 * ONE, TOS );
}
primitive( "l9", primitive_l9 );


/*
 *  set-current-l9-task - set the l9 task of the current actor
 */

function primitive_set_current_l9_task(){
  // The l9 task property is the 7th property of the actor
  move_cell( pop(), ACTOR + 6 * ONE );
}
primitive( "current-l9-task!", primitive_set_current_l9_task );


/*
 *  switch-actor - non preemptive thread switch
 */

function primitive_switch_actor(){
  actor_restore_context( pop_reference() );
}
primitive( "switch-actor", primitive_switch_actor );


/*
 *  make.actor - create a new actor with an initial IP
 */

function primitive_make_actor(){
  // ToDo: it gets a copy of the data stack?
  const actor = make_actor( pop_integer() );
  set( push(), type_reference, tag_actor, actor );
};
primitive( "make.actor", primitive_make_actor );


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
  const type = pop_integer();
  check_de&&mand( type >= 0 && type < type_invalid );
  /**/ set_type( TOS, type );
  //c/ set_type( TOS, (Type) type );
}
primitive( "cast", primitive_cast );


/*
 *  rename - change the name of the NOS value
 */

function primitive_rename(){
  const name = pop_tag();
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
 *  a-void? - true if TOS was a void type of cell
 */

function is_a_void_cell( c : Cell ) : boolean {
  return type_of( c ) == type_void;
}

const tag_is_a_void = tag( "a-void?" );

function primitive_is_a_void(){
  const it_is = is_a_void_cell( TOS );
  if( ! it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_void, it_is ? 1 : 0 );
}
primitive( "a-void?", primitive_is_a_void );


/*
 *  a-boolean? - true if TOS was a boolean
 */

function is_a_boolean_cell( c : Cell ) : boolean {
 return type_of( c ) == type_boolean;
}

const tag_is_a_boolean = tag( "a-boolean?" );

function primitive_is_a_boolean(){
  const auto_ = is_a_boolean_cell( TOS );
  if( ! auto_ ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_boolean, auto_ ? 1 : 0 );
}
primitive( "a-boolean?", primitive_is_a_boolean );


/*
 *  an-integer? - true if TOS was an integer
 */

const tag_is_an_integer = tag( "an-integer?" );

function primitive_is_an_integer(){
  const auto_ = is_an_integer_cell( TOS );
  if( ! auto_ ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_an_integer, auto_ ? 1 : 0 );
}
primitive( "an-integer?", primitive_is_an_integer );


/*
 *  is-a-float? - check if a value is a float
 */

const tag_is_a_float = tag( "is-a-float?" );

function primitive_is_a_float(){
  const top = TOS;
  const it_is = is_a_float_cell( top );
  clear( top );
  set( top, type_boolean, tag_is_a_float, it_is ? 1 : 0 );
}
primitive( "is-a-float?", primitive_is_a_float );


/*
 *  a-tag? - true if TOS is a tag
 */

function is_a_tag_cell( c : Cell ) : boolean {
  return type_of( c ) == type_tag;
}

const tag_is_a_tag = tag( "a-tag?" );

function primitive_is_a_tag(){
  const it_is = is_a_tag_cell( TOS );
  if( ! it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_tag, it_is ? 1 : 0 );
}
primitive( "a-tag?", primitive_is_a_tag );


/*
 *  a-verb? - true if TOS was a verb
 */

const tag_is_a_verb = tag( "a-verb?" );

function is_a_verb_cell( c : Cell ) : boolean {
  return type_of( c ) == type_verb;
}

function primitive_is_a_verb(){
  const it_is = is_a_verb_cell( TOS );
  if( ! it_is ){
    clear( TOS );
  }
  set( TOS, type_boolean, tag_is_a_verb, it_is ? 1 : 0 );
}
primitive( "a-verb?", primitive_is_a_verb );


/*
 *  a-text? - true if TOS was a text
 */

function is_a_text_cell( c : Cell ) : boolean {
  return type_of( c ) == type_reference
  && area_tag( value_of( c ) ) == tag_text;
}

const tag_is_a_text = tag( "a-text?" );

function primitive_is_a_text(){
  const it_is = is_a_text_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_text, it_is ? 1 : 0 );
}
primitive( "a-text?", primitive_is_a_text );


/*
 *  a-reference? - true if TOS was a reference to an object
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
 *  a-proxy? - true if TOS was a reference to proxied object
 */

function is_a_proxy_cell( c : Cell ) : boolean {
  return type_of( c ) == type_reference && name_of( c ) == tag_proxy;
}

const tag_is_a_proxy = tag( "a-proxy?" );

function primitive_is_a_proxy(){
  const it_is = is_a_proxy_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_proxy, it_is ? 1 : 0 );
}
primitive( "a-proxy?", primitive_is_a_proxy );


/*
 *  a-flow? - true if TOS was a flow
 */

function is_a_flow_cell( c : Cell ) : boolean {
  return type_of( c ) == type_reference
  && area_tag( value_of( c ) ) == tag_flow;
}

const tag_is_a_flow = tag( "a-flow?" );

function primitive_is_a_flow(){
  const it_is = is_a_flow_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_flow, it_is ? 1 : 0 );
}
primitive( "a-flow?", primitive_is_a_flow );


/*
 *  a-list? - true if TOS was a list
 */

function is_a_list_cell( c : Cell ) : boolean {
  return type_of( c ) == type_reference
  && area_tag( value_of( c ) ) == tag_list;
}

const tag_is_a_list = tag( "a-list?" );

function primitive_is_a_list(){
  const it_is = is_a_list_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_list, it_is ? 1 : 0 );
}
primitive( "a-list?", primitive_is_a_list );



/*
 * a-range? - true if TOS was a range
 */

const tag_is_a_range = tag( "a-range?" );

function is_a_range_cell( c : Cell ) : boolean {
  return type_of( c ) == type_reference
  && area_tag( value_of( c ) ) == tag_range;
}

function primitive_is_a_range(){
  const it_is = is_a_range_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_range, it_is ? 1 : 0 );
}
primitive( "a-range?", primitive_is_a_range );


/*
 *  a-box? - true if TOS was a box
 */

const tag_is_a_box = tag( "a-box?" );

function is_a_box_cell( c : Cell ) : boolean {
  return type_of( c ) == type_reference
  && area_tag( value_of( c ) ) == tag_box;
}

function primitive_is_a_box(){
  const it_is = is_a_box_cell( TOS );
  clear( TOS );
  set( TOS, type_boolean, tag_is_a_box, it_is ? 1 : 0 );
}
primitive( "a-box?", primitive_is_a_box );


/* -----------------------------------------------------------------------------
 *  Forth style data stack manipulations
 */

/*
 *  push - push the void on the data stack
 */

function primitive_push(){
  push();
}
primitive( "push", primitive_push );


/*
 *  drop - remove the top of the data stack
 */

function primitive_drop(){
  drop();
};
primitive( "drop", primitive_drop );


/*
 *  drops - remove cells from the data stack
 */

function primitive_drops(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    if( check_de && TOS <= ACTOR_data_stack )break;
    drop();
  }
}
primitive( "drops", primitive_drops );


/*
 *  duplicate - duplicate the top of the data stack
 */

function primitive_duplicate(){
  const top = TOS;
  copy_cell( top, push() );
}
primitive( "duplicate", primitive_duplicate );


/*
 *  top - duplicate the top of the data stack, like duplicate does
 */

function primitive_top(){
  const top = TOS;
  copy_cell( top, push() );
}
primitive( "top", primitive_top );


/*
 *  2dup - duplicate the top two cells of the data stack
 */

function primitive_2dup(){
  const top = TOS;
  copy_cell( top - ONE, push() );
  copy_cell( top,       push() );
}
primitive( "2dup", primitive_2dup );


/*
 *  ?dup - duplicates the top of the data stack if it is non zero
 */

function primitive_dup_if(){
  // This is the Forth style of truth, anything non zero
  if( value_of( TOS ) ){
    copy_cell( TOS, push() );
  }
}
primitive( "?dup", primitive_dup_if );


/*
 *  dups - duplicate cells from the data stack
 */

function primitive_dups(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    // ToDo: check overflow
    copy_cell( TOS, push() );
  }
}
primitive( "dups", primitive_dups );


/*
 *  overs - push cells from the data stack
 *  ie : 2OVER 2 overs ;
 */

function primitive_overs(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  let ii;
  // ToDo: test this
  const base = TOS - ( 2 * ( n - 1 ) * ONE );
  for( ii = 0 ; ii < n ; ii++ ){
    copy_cell( base + ii * ONE, push() );
  }
}
primitive( "overs", primitive_overs );


/*
 *  2over - push the third and fourth cells from TOS
 */

function primitive_2over(){
  const top = TOS;
  copy_cell( top - 3 * ONE, push() );
  copy_cell( top - 2 * ONE, push() );
}
primitive( "2over", primitive_2over );



/*
 *  nip - removes the second cell from the top of the stack
 */

function primitive_nip(){
  const old_tos = pop();
  reset_cell_value( TOS );
  move_cell( old_tos, TOS );
}
primitive( "nip", primitive_nip );


/*
 *  tuck - pushes the second cell from the top of the stack
 */

function primitive_tuck(){
  const top  = TOS;
  const tos1 = top - ONE;
  move_cell( top,          the_tmp_cell );
  move_cell( tos1,         top );
  move_cell( the_tmp_cell, tos1 );
}
primitive( "tuck", primitive_tuck );


/*
 *  swap - swaps the top two cells of the data stack
 *  ie a b -- b a
 */

const tag_swap = tag( "swap" );

function primitive_swap(){
  const tos0 = TOS;
  const tos1 = tos0 - ONE;
  move_cell( tos0,         the_tmp_cell );
  move_cell( tos1,         tos0 );
  move_cell( the_tmp_cell, tos1 );
}
primitive( "swap", primitive_swap );


/*
 *  swaps - swaps the top cells of the data stack
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
 *  over - push the second cell from the top of the stack
 */

function primitive_over(){
  const src = TOS - ONE;
  // WARNING, this bugs the C++ compiler: copy_cell( POS - 1, push() );
  // Probably because it does not understand that push() changes TOS and
  // does some optimizations that breaks... In C++, the compiler is
  // free to evaluate the arguments in the order it wants.
  copy_cell( src, push() );
}
primitive( "over", primitive_over );


/*
 *  rotate - rotate the top three cells of the data stack
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
 *  roll - rotate cells from the top of the stack
 */

function primitive_roll(){
  const n = pop_integer();
  check_de&&mand( n >= 0 );
  const top = TOS;
  let ii;
  for( ii = 0 ; ii < n ; ii++ ){
    move_cell( top - ii * ONE, the_tmp_cell );
    move_cell( top - ( ii + 1 ) * ONE, top + ii * ONE );
    move_cell( the_tmp_cell, top - ( ii + 1 ) * ONE );
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
 *  data-depth - number of elements on the data stack
 */

const tag_depth = tag( "depth" );

function primitive_data_depth(){
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  set( push(), type_integer, tag_depth, depth );
}
primitive( "data-depth", primitive_data_depth );


/*
 *  clear-data - clear the data stack, make it empty
 */

function primitive_clear_data(){
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  // ToDo: should take the opportunity to check the stack boundaries?
  legacy_de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    drop();
  }
}
primitive( "clear-data", primitive_clear_data );


/*
 *  data-dump - dump the data stack, ie print it
 */

function primitive_data_dump(){
  let auto_ = S() + "DATA STACK";
  const depth = ( ACTOR_data_stack - TOS ) / ONE;
  de&&mand( depth >= 0 );
  let ii;
  for( ii = 0 ; ii < depth ; ++ii ){
    const c = TOS + ii * ONE;
    const i = info_of( c );
    auto_ += "\n" + N( ii )
    + " " + type_as_text( unpack_type( i ) )
    + " " + tag_as_text(  unpack_name( i ) )
    + " " + cell_as_text( c );
  }
  trace( auto_ );
}
primitive( "data-dump", primitive_data_dump );


/*
 *  control-depth - number of elements on the control stack
 */

function primitive_control_depth(){
  const depth = ( ACTOR_control_stack - CSP ) / ONE;
  // ToDo: should check the stack's boundaries?
  legacy_de&&mand( depth >= 0 );
  set( push(), type_integer, tag_depth, depth );
}
primitive( "control-depth", primitive_control_depth );


/*
 *  clear-control - clear the control stack, make it empty
 */

const tag_clear_control = tag( "clear-control" );

function primitive_clear_control(){
  // Use the return address if type is appropriate
  let return_ip = 0;
  if( type_of( CSP ) == type_verb ){
    return_ip = value_of( CSP );
  }
  // ToDo: should take the opportunity to check the stack boundaries?
  while( CSP > ACTOR_control_stack ){
    drop_control();
  }
  CSP = ACTOR_control_stack;
  set( CSP, type_ip, tag_clear_control, return_ip );
}
primitive( "clear-control", primitive_clear_control );


/*
 *  FATAL - display error message and stacks, then clear stacks & exit eval loop
 */

function FATAL( message : TxtC ) : boolean {
  debugger;
  // Simplified version during bootstrap
  if( bootstrapping ){
    trace( S()+ "\nFATAL: " + message + "\n" );
    return false;
  }
  // Display error and stacks
  const auto_ = S()
  + "\nFATAL: " + message
  + " at " + tag_as_text( traced_file )
  + ":" + N( traced_line )
  + ":" + N( traced_column )
  + "\n" + stacks_dump();
  trace( auto_ );
  debugger;
  // Clear stack & get back to eval loop
  primitive_clear_data();
  primitive_clear_control();
  // ToDo: should push something to get back to eval loop?
  IP = 0;
  return false;
}


function primitive_FATAL(){
  const auto_ = pop_as_text();
  FATAL( auto_ );
}
primitive( "FATAL", primitive_FATAL );


/*
 *  control-dump - dump the control stack, ie print it
 */

function primitive_control_dump(){
  const depth = ( CSP - ACTOR_control_stack ) / ONE;
  let   auto_ = S() + "Control stack:";
  let ii;
  for( ii = 0 ; ii < depth ; ii++ ){
    const c = CSP - ii * ONE;
    const i = info_of( c );
    const t = unpack_type(  i );
    const n = unpack_name(  i );
    auto_ += "\n" + N( ii )
    + " " + type_as_text( t )
    + " " + tag_as_text(  n )
    + " " + cell_as_text( c );
  }
  trace( auto_ );
}
primitive( "control-dump", primitive_control_dump );


/**/ function integer_as_text( v : Value ){ return "" + v; }
/*c{
  Text integer_as_text( Value v ){
    return N( v );
  }
}*/


/*
 *  text.quote - turn a text into a valid text literal
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
  let auto_ = S();
  let ii = 0;
  const len = tlen( txt );
  for( ii = 0; ii < len ; ii++ ){
    const auto_ch = tat( txt, ii );
    if( teq( auto_ch, "\r" ) ){
      auto_ += "\\r";
    }else if( teq( auto_ch, "\n" ) ){
      auto_ += "\\n";
    }else if( teq( auto_ch, "\t" ) ){
      auto_ += "\\t";
    }else if( teq( auto_ch, "\"" ) ){
      auto_ += "\\\"";
    }else if( teq( auto_ch, "\\" ) ){
      auto_ += "\\\\";
    }else if(
      /**/ auto_ch         < " "
      //c/ auto_ch.at( 0 ) < ' '
     ){
      /**/ auto_ += "\\x" + HEX( auto_ch.charCodeAt( 0 ) );
      // In C++, get char code of first charactor of string
      //c/ auto_buf += "\\x" + HEX( auto_ch.at( 0 ) );
    }else{
      auto_ += auto_ch;
    }
  }
  return "\"" + auto_ + "\"";
}


function primitive_text_quote(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_text( text_quote( auto_ ) );
  // ToDo: should name the result?
}
primitive( "text.quote", primitive_text_quote );


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
 *  text.as-integer - convert a text literal to an integer
 */

function checked_integer_from_text( txt : TxtC ) : Value {
  // TypeScript version:
  /**/ return parseInt( txt );
  // C++ version:
  /*c{
    int result = parseInt( txt, 10 );
    if( parse_int_error ){
      FATAL( "text.to-integer: invalid integer" );
    }
    return result;
  }*/
}


/*
 *  text.hex-to-integer - convert a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_integer_from_hex_text( txt : TxtC ) : Value {
  // TypeScript version:
  /**/ return parseInt( txt, 16 );
  // C++ version:
  /*c{
    int result = parseInt( txt, 16 );
    if( parse_int_error ){
      FATAL( "text.hex-to-integer: invalid integer" );
    }
    return result;
  }*/
}


function primitive_text_integer_from_hexadecimal(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_integer( checked_integer_from_hex_text( auto_ ) );
}
primitive( "text.integer-from-hexadecimal", primitive_text_integer_from_hexadecimal );


/*
 *  text.octal-to-integer - convert a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_integer_from_octal_text( txt : TxtC ) : Value {
  // TypeScript version:
  /**/ return parseInt( txt, 8 );
  // C++ version:
  /*c{
    int result = parseInt( txt, 8 );
    if( parse_int_error ){
      FATAL( "text.octal-to-integer: invalid integer" );
    }
    return result;
  }*/
}


function primitive_text_octal_as_integer(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_integer( checked_integer_from_octal_text( auto_ ) );
}
primitive( "text.octal-as-integer", primitive_text_octal_as_integer );


/*
 *  text.binary-to-integer - converts a text literal to an integer
 *  ToDo: should not FATAL on error
 */

function checked_integer_from_binary_text( txt : TxtC ) : Value {
  // TypeScript version:
  /**/ return parseInt( txt, 2 );
  // C++ version:
  /*c{
    int result = parseInt( txt, 2 );
    if( parse_int_error ){
      FATAL( "text.integer-from-binary: invalid integer" );
    }
    return result;
  }*/
}


function primitive_text_integer_from_binary(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_integer( checked_integer_from_binary_text( auto_ ) );
}
primitive( "text.integer-from-binary", primitive_text_integer_from_binary );


/*
 *  intege.as-hexadecimal - converts an integer to an hexadecimal text
 */

function primitive_integer_as_hexadecimal(){
  const i = pop_integer();
  // TypeScript version:
  /**/ push_text( i.toString( 16 ) );
  // C++ version:
  /*c{
    push_text( HEX( i ) );
  }*/
}
primitive( "integer.as-hexadecimal", primitive_integer_as_hexadecimal );


/*
 *  integer.as-octal - convert an integer to an octal text
 */

function primitive_integer_as_octal(){
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
primitive( "integer.as-octal", primitive_integer_as_octal );


/*
 *  integer.as-binary - converts an integer into a binary text
 */

function primitive_integer_as_binary(){
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
primitive( "integer.as-binary", primitive_integer_as_binary );


/*
 *  text.unquote - turns a JSON text into a text
 */

function text_unquote( txt : TxtC ) : Text {
  let auto_ = S();
  let ii = 0;
  const len = tlen( txt );
  while( ii < len ){
    let auto_ch = tat( txt, ii );
    ii++;
    if( teq( auto_ch, "\\" ) ){
      auto_ch = tat( txt, ii );
      ii++;
      if( teq( auto_ch, "r" ) ){
        auto_ += "\r";
      }else if( teq( auto_ch, "n" ) ){
        auto_ += "\n";
      }else if( teq( auto_ch, "t" ) ){
        auto_ += "\t";
      }else if( teq( auto_ch, "\"" ) ){
        auto_ += "\"";
      }else if( teq( auto_ch, "\\" ) ){
        auto_ += "\\";
      }else if( teq( auto_ch, "x" ) ){
        ii++;
        const auto_ch1 = tat( txt, ii );
        ii++;
        const auto_ch2 = tat( txt, ii );
        const auto_hex = auto_ch1 + auto_ch2;
        const auto_dec = parseInt( auto_hex, 16 );
        /**/ auto_ += String.fromCharCode( auto_dec );
        // In C++, get char code of first charactor of string
        //c/ auto_buf += char( auto_dec );
      }else{
        bug( S() + "Invalid escape sequence, \\" + auto_ch );
      }
    }else{
      auto_ += auto_ch;
    }
  }
  return auto_;
}


function primitive_text_unquote(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_text( text_unquote( auto_ ) );
}
primitive( "text.unquote", primitive_text_unquote );


/*
 *  text.pad - pads a text with spaces
 */

function text_pad( txt : TxtC, pad_len : Count ) : Text {
  let auto_ = S();
  let ii = 0;
  const len = tlen( txt );
  while( ii < pad_len ){
    if( ii < len ){
      auto_ += tat( txt, ii );
    }else{
      auto_ += " ";
    }
    ii++;
  }
  return auto_;
}

function primitive_text_pad(){
  const auto_len = pop_integer();
  const auto_t = cell_as_text( TOS );
  drop();
  push_text( text_pad( auto_t, auto_len ) );
}
primitive( "text.pad", primitive_text_pad );


/*
 *  text.trim - trims a text
 */

function text_trim( txt : TxtC ) : Text {
  // First trim leading spaces
  let auto_ = S();
  let ii = 0;
  let len = tlen( txt );
  let only_spaces = true;
  let auto_ch = "";
  while( ii < len ){
    auto_ch = tat( txt, ii );
    if( only_spaces ){
      if( tneq( auto_ch, " " ) ){
        only_spaces = false;
      }else{
        // Skip leading spaces
        continue;
      }
    }
    auto_ += auto_ch;
    ii++;
  }
  // Then trim trailing spaces
  let auto_buf2 = S();
  len = tlen( auto_ );
  ii = len - 1;
  only_spaces = true;
  while( ii >= 0 ){
    auto_ch = tat( auto_, ii );
    if( only_spaces ){
      if( tneq( auto_ch, " " ) ){
        only_spaces = false;
      }else{
        // Skip trailing spaces
        continue;
      }
    }
    auto_buf2 = auto_ch + auto_buf2;
    ii--;
  }
  return auto_buf2;
}

function primitive_text_trim(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_text( text_trim( auto_ ) );
}
primitive( "text.trim", primitive_text_trim );


/* -----------------------------------------------------------------------------
 *  Some memory integrity checks
 */

function proxy_is_safe( proxy : Cell ) : boolean {
  /**/ return all_proxied_objects_by_id.has( proxy )
  //c/ return area_is_safe( proxy );
}


function reference_is_safe( a : Cell ) : boolean {
  if( ! area_is_safe( a ) )return false;
  return true;
}


function cell_looks_safe( c : Cell ) : boolean {
// Try to determine if a cell looks like a valid one

  const v = value_of( c );
  const i = info_of( c );
  const t = unpack_type( i );
  const n = unpack_name( i );

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

  case type_reference :
    if( n == tag_text ){
      if( ! lean_str_is_valid( referencee ) ){
        bug( S()
          + "Invalid lean string for text cell, " + C( referencee )
          + " at " + C( c )
        );
        debugger;
        lean_str_is_valid( referencee );
        return false;
      }
      // ToDo: check it is a text
      return true;
    }
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

  case type_primitive :
    // ToDo: check
    return true;

  case type_void :
    return true;

  default :
    bug( S()+ "Invalid type for cell" + N( t ) + " at " + C( c ) );
    return false;

  }
}


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
 *    portion of the cell has 29 bits available. Semantically, the name is
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
 *    - range.free?
 *    - range.bind( entity )
 *    - range.unbind
 *    - range.extract
 *    - range.inject( something )
 */


// Different types of ranges

// [ n ... m ], from n to m included
const range_type_to = 0;

// [ n .. m ], from n to m excluded
const range_type_but = 1;

// [ n :: l ], from n for l items
const range_type_for = 2;


const tag_range_type    = tag( "range-type" );
const tag_range_low     = tag( "range-low" );
const tag_range_high    = tag( "range-high" );
const tag_range_binding = tag( "range-binding" );


function new_bound_range( c : Cell, type : Index, to : Value ){

  // Allocate 4 cells for type, low, high and bound entity
  // ToDo: allocate more or less depending on the type
  const range = allocate_area( tag_range, 4 * size_of_cell );

  // Set the type
  set( range + 0 * ONE, type_integer, tag_range_type, type );

  // Set the lower limit, an index, potentially negative
  set( range + 1 * ONE, type_integer, tag_range_low, 0 );

  // Set the upper limit, either an index or a length
  set( range + 2 * ONE, type_integer, tag_range_high, 0 );

  // Set the bound entity, if any, or else it is 0
  set( range + 3 * ONE, type_integer, tag_range_binding, to );

  // Set the range in the cell
  set( c, type_reference, tag_range, range );

  // Increment the reference count of the bound entity if any
  if( to ){
    // ToDo: avoid the double check against 0 that area_lock does too
    area_lock( to );
  }

}


function range_set_type( c : Cell, type : Index ){
  set_value( c + 0 * ONE, type );
}


function range_get_type( c : Cell ) : Index {
  return value_of( c + 0 * ONE );
}


function range_set_low( c : Cell, low : Index ){
  set_value( c + 1 * ONE, low );
}


function range_get_low( c : Cell ) : Index {
  return value_of( c + 1 * ONE );
}


function range_set_high( c : Cell, high : Index ){
  set_value( c + 2 * ONE, high );
}


function range_get_high( c : Cell ) : Index {
  return value_of( c + 2 * ONE );
}


function range_set_binding( c : Cell, binding : Value ){
  set_value( c + 3 * ONE, binding );
}


function range_get_binding( c : Cell ) : Value {
  // ToDo: should be first value of the area to avoid the frequent + 3 * ONE?
  return value_of( c + 3 * ONE );
}


function range_length( c : Cell ) : Length {
// Return the maximum possible length of the range
  let low;
  let high;
  switch( range_get_type( c ) ){
    case range_type_but:
      low  = range_get_low( c );
      high = range_get_high( c );
      if( low < 0 ){
        if( high >= 0 ){
          return 0x7FFFFFFF;
        } else {
          if( high <= low ){
            return 0;
          } else {
            return high - low;
          }
        }
      } else {
        if( high < 0 ){
          return 0x7FFFFFFF;
        } else {
          if( high <= low ){
            return 0;
          } else {
            return high - low;
          }
        }
      }
    break;
    case range_type_for:
      return range_get_high( c );
    break;
    default:
      debugger;
      return 0;
  }
}


function range_free( c : Cell ){
  const range = value_of( c );
  const binding = range_get_binding( range );
  if( binding != 0 ){
    area_free( binding );
  }
  area_free( range );
  reset( c );
}


function range_is_bound( c : Cell ) : boolean {
  return range_get_binding( c ) != 0;
}


function range_is_free( c : Cell ) : boolean {
  return range_get_binding( c ) == 0;
}


function range_textify_into( object : Cell, dest : Cell ){

  let bound_object;

  bound_object = range_get_binding( object );

  if( bound_object == 0 ){
    copy_cell( the_empty_text_cell, dest );
    return;
  }

  // Either a lean string or some array
  switch( area_tag( bound_object ) ){

    case tag_text:
      copy_cell( bound_object, dest );
      return;

    case tag_box:
      copy_cell( bound_object, the_tmp_cell );
      cell_textify( the_tmp_cell );
      move_cell( the_tmp_cell, dest );
      return;

    case tag_range:
      // ToDo: range over range
      debugger;
      copy_cell( the_empty_text_cell, dest );
      return;

    default:
      // ToDo: ??
      debugger;
      copy_cell( the_empty_text_cell, dest );
  }
  return;

}


/* ----------------------------------------------------------------------------
 *  Debug tool
 */


function is_a_tag_singleton( c : Cell ) : boolean {
  if( ! is_a_tag_cell( c ) )return false;
  // xx:/xx magic marker
  return ( value_of( c ) == c || c == 0 );
}


// The header of each block of machine codes
// ToDo: create a "definition" type? no: use verb
const tag_block = tag( "block" );


function cell_is_a_block( c : Cell ) : boolean {
  return name_of( c ) == tag_block_header;
}


function is_a_verb_block( c : Cell ) : boolean {
// True when block is the definition of a verb vs inline code.
  return cell_is_a_block( c ) && ! is_an_inline_block_cell( c );
}


function block_dump( ip : Cell ) : Text {
  de&&mand( cell_is_a_block( ip ) );
  const length = block_length( ip );
  let auto_ = S();
  auto_ += "Block " + C( ip ) + ", length " + N( length );
  // ToD: decode flags
  if( is_an_inline_block_cell( ip ) ){
    auto_ += ", inline {}";
  }else{
    auto_ += ", verb definition";
    if( is_immediate_verb( name_of( ip ) ) ){
      auto_ += ", immediate";
    }
  }
  return auto_;
}


let cell_dump_entered = false;

function tag_as_dump_text( tag : Value ) : Text {
  return tag_as_text( tag );
  if( tag == 0 ){
    return "invalid-0-tag";
  }else if( ! tag_is_valid( tag ) ){
    return "invalid-tag-" + N( tag );
  }else{
    return tag_as_text( tag );
  }
}


function find_debug_info( c : Cell ) : Text {
  if( c == 0 )return no_text;
  let ptr = c + ONE;
  // Look for a call to primitive "debug_info", moving backward
  let n;
  const limit = c - 10 * ONE;
  while( true ){
    ptr -= ONE;
    if( ptr == 0 )break;
    n = name_of( ptr );
    if( n == tag_debug_info )break;
    if( n == tag_block_header )break;
    if( ptr < limit )break;
  }
  if( n != tag_debug_info ){
    return no_text;
  }
  const debug_info = value_of( ptr );
  return debug_info_as_text( debug_info );
}


function dump( c : Cell ) : Text {
// Return a text representation that is usefull for debugging

  // Never dereference the cell at address 0, at least in C++
  /*c{
    if( c == 0 ){
      return "<null>";
    }
  }*/

  // Detect erroneous recursive calls
  if( cell_dump_entered ){
    dump_invalid_cell = c;
    return "Error, reentered cell_dump( " + C( c ) + " )";
  }
  cell_dump_entered = true;

  const is_valid = cell_looks_safe( c );
  if( ! is_valid ){
    dump_invalid_cell = c;
    debugger;
    cell_looks_safe(  c  );
  }

  let v = value_of( c );
  let i = info_of(  c );
  let t = unpack_type( i );
  let n = unpack_name( i );

  let class_name_tag;

  /**/ let  buf = "";
  //c/ Text buf(  "" );
  /**/ let  txt = "";
  //c/ Text txt(  "" );

  switch( t ){

    case type_void :

      if( v == 0 ){
        // buf += ":<void>";
      }else{
        buf += C( v ) + " as-void" + C( v );
      }

      if( n != tag_void || v != 0 ){
        if( tag_is_valid( n ) ){
          buf += " :" + tag_as_text( n );
        }else{
          dump_invalid_cell = c;
          buf += " Invalid-tag-" + N( n );
        }
      }

    break;

    case type_boolean :

      if( v == 0 || v == 1 ){
        buf += v ? "true" : "false";
      }else{
        dump_invalid_cell = c;
        buf += "Invalid-boolean-" + N( v );
      }

      if( n != tag_boolean ){
        buf += " :" + tag_as_dump_text( n );
      }

    break;

    case type_tag :

      if( n == v ){
        buf += tag_as_dump_text( n ) + "/";
        if( is_a_tag_singleton( c ) ){
          buf += " - <SINGLETON>";
        }
      }else{
        buf += tag_as_dump_text( v ) + " :" + tag_as_dump_text( n );
      }

    break;

    case type_integer :

      if( n == the_tag_for_dynamic_area_size ){
        // Check integrity of dynamic area
        if( ! area_is_safe( area_from_header( c - ONE ) ) ){
          dump_invalid_cell = c;
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          if( area_is_busy( area_from_header( c - ONE ) )){
            let length = to_cell( v ) - 2;
            return S()+ "busy, length: "
            + N( to_cell( v ) - 2  );
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

      buf += integer_as_text( v );

      if( n != tag_integer ){
        buf += " :" + tag_as_dump_text( n );
      }

    break;

    case type_float :
      buf += float_as_text( v );
      if( n != tag_integer ){
        buf += " :" + tag_as_dump_text( n );
      }
    break;

    case type_reference :

      class_name_tag = area_tag( v );

      // text
      if( class_name_tag == tag_text ){
        txt = cell_as_text( c );
        // ToDo: truncate somewhere else
        if( tlen( txt ) > 31 ){
          txt = tcut( txt, 31 ) + "..." + N( tlen( txt ) );
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
        }else if( tnone( txt ) && v != 0 ){
          buf += " ( <INVALID_EMPTY_TEXT> )";
        }

      // range
      }else if( class_name_tag == tag_range ){
        buf += "<";
        if( range_get_type( v ) == range_type_for ){
          buf += N( range_get_low( v ) ) + "::" + N( range_get_high( v ) );
        }else if( range_get_type( v ) == range_type_but ){
          buf += N( range_get_low( v ) ) + ".." + N( range_get_high( v ) );
        }else{
          buf += N( range_get_low( v ) ) + "..." + N( range_get_high( v ) );
        }
        if( range_is_bound( v ) ){
          buf += "@" + C( range_get_binding( v ) );
        }
        buf += ">";
        if( n != tag_range ){
          buf += " :" + tag_as_dump_text( n );
        }

      // box
      }else if( class_name_tag == tag_box ){
        buf += "<box:" + short_dump( v ) + "@" + C( v ) + ">";
        if( n != tag_box ){
          buf += " :" + tag_as_dump_text( n );
        }

      // proxy
      }else if( class_name_tag == tag_proxy ){
        /**/ const obj = proxied_object_by_id( v );
        /**/ const proxy_class_name = obj.constructor.name;
        // ToDo: in C++, the instance of AbstractProxy should give the class name
        /**/ //c/ TxtC proxy_class_name( "invalid-proxy" );
        /**/ buf += tag_as_text( n )
        /**/ + "<proxied-" + proxy_class_name + C( v ) + ">";
        if( n != tag_proxy ){
          buf += " :" + tag_as_dump_text( n );
        }

      }else if( class_name_tag == tag_flow ){
        // ToDo: add name
        buf += tag_as_dump_text( n ) + ":<flow:" + N( v ) + ">";
        if( n != tag_flow ){
          buf += " :" + tag_as_dump_text( n );
        }

      }else{
        buf += "<" + tag_as_dump_text( class_name_tag ) + C( v ) + ">"
        + " :" + tag_as_dump_text( n );
      }
    break;

    case type_verb :
      buf += "#" + tag_as_dump_text( n ) + "#";
      // Try to find some debug info nearby
      if( v ){
        const auto_text_debug_info = find_debug_info( v );
        if( tsome( auto_text_debug_info ) ){
          buf += " ( " + auto_text_debug_info + " )";
        }
      }
    break;

    case type_primitive :
      buf += "##" + tag_as_dump_text( n ) + "#";
      if( n == tag_block ){
        // Block description often comes next
        // ToDo: check presence of block header
        if( cell_is_a_block( c + ONE ) ){
          cell_dump_entered = false;
          return S()+ "block definition";
        }
      }
      break;

    default :
      de&&mand( false );
      dump_invalid_cell = c;
      buf += tag_as_dump_text( n )
      + ":<invalid type " + C( t ) + ":" + C( v ) + ">";
      if( n != 0 ){
        buf += " :" + tag_as_dump_text( n );
      }
      breakpoint();
    break;

  }

  cell_dump_entered = false;

  if( blabla_de || dump_invalid_cell != 0 ){
    buf += "        ( " + N( t ) + "/" + N( n ) + "/" + N( v )
    + " " + type_as_text( t ) + " " + C( c )
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
  if( ! is_valid ){
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
        buf += tag_as_dump_text( n );
      }
      if( v == 0 ){
        // buf += ":<void>";
      }else{
        buf += ":<void:" + C( v ) + ">";
      }
    break;

    case type_boolean :
      if( n != tag_boolean ){
        buf += tag_as_dump_text( n ) + ":";
      }
      buf += v ? "true" : "false";
    break;

    case type_tag :
      if( n == v ){
        buf += "/" + tag_as_dump_text( n );
      }else{
        buf += tag_as_dump_text( n ) + ":/" + tag_as_dump_text( v );
      }
    break;

    case type_integer :
      if( n != tag_integer ){
        buf += tag_as_dump_text( n ) + ":";
      }
      buf += integer_as_text( v );
    break;

    case type_verb :
      buf += "#" + tag_as_dump_text( n ) + "#";
    break;

    case type_primitive :
      if( n != tag_void || v != 0 ){
        buf += tag_as_dump_text( n );
      }
      buf += ":<primitive: " + C( v ) + ">";
    break;

    case type_reference :

      // ToDo: add class
      class_name_tag = name_of( v );

      if( class_name_tag == tag_text ){
        // ToDo: truncate somewhere else
        if( tlen( txt ) > 31 ){
          txt = tcut( txt, 31 ) + "..." + N( tlen( txt ) );
        }
        if( n != tag_text ){
          buf += tag_as_dump_text( n )  + ":";
        }
        // ToDo: better escape
        /**/ txt = txt
        /**/ .replace( "\n",  () => "\\n"  )
        /**/ .replace( "\"",  () => "\\\"" )
        /**/ .replace( "\t",  () => "\\t"  )
        /**/ .replace( "\r",  () => "\\r"  )
        /**/ .replace( "\\",  () => "\\\\" )
        buf += "\"" + txt + "\"";

      }else if( class_name_tag == tag_proxy ){
        /**/ const obj = proxied_object_by_id( v );
        /**/ const proxy_class_name = obj.constructor.name;
        /**/ //c/ Text proxy_class_name( "c_string" );
        /**/ buf += tag_as_dump_text( n )
        /**/ + "<proxied-" + proxy_class_name + C( v ) + ">";

      }else if( class_name_tag == tag_flow ){      // ToDo: add name
        buf += tag_as_dump_text( n ) + ":<flow:" + N( v ) + ">";

      }else{
        if( tag_is_valid( class_name_tag ) ){
          buf += tag_as_dump_text( n )
          + "<" + tag_as_dump_text( class_name_tag ) + ">";
        }else{
          buf += "invalid-referennce <" + N( class_name_tag ) + ">";
        }
      }
    break;

    default :
      de&&mand( false );
      buf += tag_as_dump_text( n )
      + ":<invalid-type " + C( t ) + ":" + C( v ) + ">";
      breakpoint();
    break;

  }

  cell_dump_entered = false;

  return buf;

}


function stacks_dump() : Text {
// Returns a text dump of the cells of the data and control stacks, stack trace

  const top = TOS;
  const csp = CSP;

  /**/ let  buf = "\nDATA STACK:";
  //c/ Text buf(  "\nDATA STACK:" );
  let ptr  = top;

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
    buf += "\nData stack underflow, top " + N( top )
    + ", base "       + C( base )
    + ", delta "      + N( top - base )
    + ", excess pop " + N( ( top - base ) / ONE );
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


/**/ let trace_capture_buffer = no_text;
//c/ static Text trace_capture_buffer = no_text;

function primitive_log(){

  const verb = pop_tag();

  if( verb == tag( "do-not" ) ){
    can_log = false;
  }

  if( verb == tag( "do" ) ){
    can_log = true;
  }

  if( verb == tag( "flush" ) ){
    trace_capture_buffer = no_text;
  }

  if( verb == tag( "capture" ) ){
    push_text( trace_capture_buffer );
  }

  if( verb == tag( "expect" ) ){
    if( ! can_log || ! trace_capture_enabled ){
      push_true();
    }else{
      if( tneq( trace_capture_buffer, pop_as_text() ) ){
        push_false();
      }else{
        push_true();
      }
      trace_capture_buffer = no_text;
    }
  }

  /**/ bug = can_log ? console.log : trace;

  if( verb == tag( "enable" ) ){

    const domain_id = pop_tag();

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

    if( domain_id == tag( "debug-info" ) ){
      /**/ info_de = true;
      /*c{
        #ifndef info_de
          info_de = true;
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

    if( domain_id == tag( "capture" ) ){
      trace_capture_enabled = true;
      trace_capture_buffer  = no_text;
    }

  }else if( verb == tag( "disable" ) ){

    const domain_id = pop_tag();

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

    if( domain_id == tag( "debug-info" ) ){
      /**/ info_de = false;
      /*c{
        #ifndef info_de
          info_de = false;
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

    if( domain_id == tag( "capture" ) ){
      trace_capture_enabled = true;
      trace_capture_buffer  = no_text;
    }
  }
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
  pop_ip();

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
  if( ! de ){
    pop_raw_value();
    return;
  }

  check_de&&mand_block( TOS );

  call( tag_assert, pop_raw_value() );

  // Schedule assertion checker execution
  defer( tag_assert_checker, assert_checker_definition );

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
const pack_reference = pack( type_reference,  tag_reference );
const pack_verb      = pack( type_verb,       tag_verb      );

/*
 *  type-of - Get type of the TOS value, as a tag
 */

function primitive_type_of(){
  const tag = tag_of_type( type_of( TOS ) );
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
  const name_cell = pop();
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
  /**/ const typ_tag = tag_of_type( typ );
  //c/ Tag   typ_tag = tag_of_type( (Type) typ );
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

function type_as_text( type_id : Index ) : Text {
// Convert a type id, 0..7, into a text
  if( type_id < 0 || type_id >= type_invalid ){
    return "invalid";
  }
  return all_symbol_texts[ type_id ];
}


function tag_of_type( type_id : Type ) : Tag {
// Convert a type id, 0..7, into it's tag
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
  // For references, it is the name stored in the first cell of the object header
  if( t == type_reference ){
    return area_tag( value_of( c ) );
  }
  return tag_of_type( type_of( c ) );
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


/*
 *  if - run a block if condition is met
 */

const tag_if = tag( "if" );

function primitive_if(){
// Run block if boolean is true
  const block = pop_block();
  if( pop_boolean() == 0 )return;
  call( tag_if, block );
}
primitive( "if", primitive_if );


/*
 *  if-not - run a block if condition is not met
 */

const tag_if_not = tag( "if-not" );

function primitive_if_not(){
// Run block if boolean is false
  const block = pop_block();
  if( pop_boolean() != 0 )return;
  call( tag_if_not, block );
}
primitive( "if-not", primitive_if_not );


/*
 *  if-else - run one of two blocks depending on condition
 */

const tag_if_else = tag( "if-else" );

function primitive_if_else(){
// Run one of two blocks
  const else_block = pop_block();
  const then_block = pop_block();
  call( tag_if_else, pop_boolean() == 0 ? else_block : then_block );
}
primitive( "if-else", primitive_if_else );


/*
 *  on-return - run a block when the current block returns
 */

const tag_on_return = tag( "on-return" );

function primitive_on_return(){
  const block = pop_integer();
  defer( tag_on_return, block );
}
primitive( "on-return", primitive_on_return );


/*
 *  >control - move top of data stack to the control stack
 *  >R, R>, R@, Forth style
 */

const tag_to_control = tag( ">control" );

function primitive_to_control(){
  // >R in Forth
  CSP += ONE;
  move_cell( pop(), CSP );
}
primitive( ">control", primitive_to_control );


/*
 *  control> - move top of control stack to the data stack
 */

const tag_from_control = tag( "control>" );

function primitive_from_control(){
  // R> in Forth
  move_cell( CSP, push() );
  CSP -= ONE;
}
primitive( "control>", primitive_from_control );


function primitive_fetch_control(){
  // R@ in Forth
  copy_cell( CSP, push() );
}
primitive( "fetch-control", primitive_fetch_control );


/*
 *  while - while condition block produces true, run body block
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
  defer( tag_break_sentinel, IP + 2 * ONE );
  // Schedule body and condition execution
  defer( tag_while_body, body_block );
  defer( tag_while_condition, condition_block );
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
  call( tag_goto_while_3, condition_block );
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
    // ip currently points after this primitive, hence while-2 is before
    defer( tag_goto_while_2, IP - 2 * ONE );
    // CSP must now point to while-2 primitive verb
    de&&mand_eq( name_of( value_of( CSP ) ), tag_while_2 );
    // Jump into the body block
    IP = body_block;

  // The while condition is not met, it is time to exit the loop
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
 *  loop primitive - loop until break
 */

function primitive_loop(){
  const body_block = pop_block();
  // Save info for break-loop, it would skip to after loop
  call( tag_break_sentinel, body_block );
  // Schedule body block, it will return to itself, loopimg until some break
  defer( tag_break_sentinel, body_block );
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
 *  break - exit loop
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
    drop_control();
  }
}
primitive( "break", primitive_break );


/*
 *  break-if - exit loop if condition is true
 */

function primitive_break_if(){
  if( pop_boolean() ){
    primitive_break();
  }
}
primitive( "break-if", primitive_break_if );


/*
 *  break-unless - exit loop unless condition is true
 */

function primitive_break_unless(){
  if( pop_boolean() ){
    primitive_break();
  }
}
primitive( "break-unless", primitive_break_unless );


/*
 *  sentinel - install a sentinel inside the control stack
 */

function primitive_sentinel(){
  const sentinel_name = pop_tag();
  defer( sentinel_name, IP );
}
primitive( "sentinel", primitive_sentinel );


/*
 *  long jump - lookup for a sentinel and jump where it was installed
 */


function primitive_long_jump(){
// Non local return up to some sentinel set using sentinel
  const sentinel_name = pop_tag();
  const sentinel_csp = lookup_sentinel( CSP, sentinel_name );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL(
      "jump, missing sentinel " + tag_as_text( sentinel_name )
    );
    return;
  }
  // The sentinel holds a valid return address
  IP = eat_ip( CSP );
  // Clear control stack up to sentinel included
  while( CSP >= sentinel_csp ){
    drop_control();
  }
}
primitive( "long-jump", primitive_long_jump );


/*
 *  loop-until - loop until condition is met
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
    defer( tag_loop_until, until_checker_definition );
    defer( tag_loop_condition, condition_block );
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
    defer( tag_loop_until, while_checker_definition );
    defer( tag_loop_condition, condition_block );
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
  call(  tag_break_sentinel, body_block );
  defer( tag_loop_condition, condition_block );
  defer( tag_loop_body, body_block );
  defer( tag_until_checker, until_checker_definition );
  defer( tag_loop_condition, condition_block );
  IP = body_block;
}
primitive( "loop-until", primitive_loop_until );


/*
 *  loop-while - loop while condition is met
 */

function primitive_loop_while(){
  const condition_block = pop_block();
  const body_block      = pop_block();
  call(  tag_break_sentinel, body_block );
  defer( tag_loop_condition, condition_block );
  defer( tag_loop_body, body_block );
  defer( tag_until_checker, while_checker_definition );
  defer( tag_loop_condition, condition_block );
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

  const top = TOS;
  const target = top + ONE;

  const target_class_name = ! is_a_reference_type( target_type )
  ? type_as_text( target_type )
  : tag_as_text( name_of( target ) );

  const full_name = target_class_name + "." + tag_as_text( operator_tag );

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

  call( verb_id, definition_of( verb_id ) );

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
  const fullname = tag_as_text( t ) + "." + tag_as_text( n );
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
  = tag_as_text( target_type ) + "." + tag_as_text( operator_name );

  // For reference types
  if( is_a_reference_type( target_type ) ){


  // For not reference types, including integer
  }else{

    const top = TOS;
    const target = top + ONE;

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
    call( verb_id, definition_of( verb_id ) );
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
 *  + - addition operator primitive
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
 *  integer.+ - add two integers
 */

function primitive_integer_add(){
  push_integer( pop_integer() + pop_integer() );
}

primitive( "integer.+", primitive_integer_add );


/*
 *  = - value equality binary operator
 */

const tag_is_equal = tag( "=" );

function primitive_is_equal(){

  const p2 = pop();
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
    if( ! is_sharable( p1 ) ){
      clear( p2 );
      clear( p1 );
      set( p1, type_boolean, tag_is_equal, 0 );
      return;
    }
    // For text, compare content
    if( type1 == type_reference && area_tag( value1 ) == tag_text ){
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
operator_primitive( "=", primitive_is_equal );


/*
 *  equal? - like = but it is not an operator, value equality
 */

primitive( "equal?", primitive_is_equal );


/*
 *  <> - value inequality, the opposite of = value equality
 */

function primitive_is_not_equal(){
  primitive_is_equal();
  if( value_of( TOS ) == 0 ){
    set( TOS, type_boolean, tag_is_equal, 1 );
  }else{
    set( TOS, type_boolean, tag_is_equal, 0 );
  }
}
operator_primitive( "<>", primitive_is_not_equal );

/*
 *  not= - value inequality, the opposite of = value equality
 */

operator_primitive( "not=", primitive_is_not_equal );


/*
 *  inequal? - like <> and not= but it is not an operator
 */

primitive( "inequal?", primitive_is_not_equal );


/*
 *  same? - true if two objects or two values are the same one
 */

function primitive_is_identical(){

  const p2     = pop();
  const p1     = TOS;
  const value1 = value_of( p1 );
  const value2 = value_of( p2 );

  if( value1 != value2 ){
    clear( p2 );
    clear( p1 );
    set_value( p1, 0 );
    return;
  }

  const type1  = type_of(  p1 );
  const type2  = type_of(  p2 );

  clear( p2 );
  clear( p1 );

  if( type1 == type2 ){
    set_value( p1, 1 );
  }else{
    set_value( p1, 0 );
  }

}
operator_primitive( "same?", primitive_is_identical );


/*
 *  identical? - like same? but it is not an operator
 */

primitive( "identical?", primitive_is_identical );



/*
 *  different? - true unless two objects or two values are the same one
 */

function primitive_is_not_identical(){
  primitive_is_identical();
  set_value( TOS, value_of( TOS ) == 0 ? 1 : 0 );
}
operator_primitive( "different?", primitive_is_not_identical );


/*
 *  Generic solution for arithmetic operators
 */

/*ts{*/

function checked_int_parameter() : Integer {
  const p1 = TOS;
  if( check_de ){
    const type_of_p1 = type_of( p1 );
    if( type_of_p1 != type_integer ){
      FATAL( "bad type, expecting integer operand" );
      return 0;
    }
  }
  return value_of( p1 );
}


function checked_int_first_parameter() : Integer {
  const p1 = TOS;
  if( check_de ){
    const type_of_p1 = type_of( p1 );
    if( type_of_p1 != type_integer ){
      FATAL( "bad type, expecting integer first operand" );
      return 0;
    }
  }
  return value_of( p1 );
}

function checked_int_second_parameter() : Integer {
  if( check_de ){
    const p2 = TOS;
    const type_of_p2 = type_of( p2 );
    if( type_of_p2 != type_integer ){
      FATAL( "bad type, expecting integer second operand" );
      return 0;
    }
  }
  return pop_raw_value();
}


function checked_int_minus(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a - b );
}


function checked_int_multiply(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a * b );
}


function checked_int_divide(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a / b );
}


function checked_int_modulo(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a % b );
}


function checked_int_plus(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a + b );
}


function checked_int_shift_left(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a << b );
}


function checked_int_shift_right(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a >> b );
}


function checked_int_and(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a & b );
}


function checked_int_or(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a | b );
}


function checked_int_xor(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, a ^ b );
}


function checked_int_not(){
  const a = checked_int_parameter();
  set_value( TOS, ~a );
}


function checked_int_negate(){
  const a = checked_int_parameter();
  set_value( TOS, -a );
}


function checked_int_power(){
  const b = checked_int_second_parameter();
  const a = checked_int_first_parameter();
  set_value( TOS, Math.pow( a, b ) );
}


/*}*/

/*c{

static void check_int_parameters( int* a, int* b ){
  const p2 = pop();
  const p1 = TOS;
  if( check_de ){
    const type_of_p2 = type_of( p2 );
    const type_of_p1 = type_of( p1 );
    if( type_of_p2 > type_integer ){
      FATAL( "bad type, expecting integer or boolean second operand" );
      return;
    }
    if( type_of_p1 > type_integer ){
      FATAL( "bad type, expecting integer or boolean first operand" );
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

static void checked_int_shift_left( void ){
  int a, b;
  check_int_parameters( &a, &b );
  set_value( TOS, a << b );
}

static void checked_int_shift_right( void ){
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

}*/

operator_primitive( "-",     checked_int_minus );
operator_primitive( "*",     checked_int_multiply );
operator_primitive( "/",     checked_int_divide );
operator_primitive( "%",     checked_int_modulo );
operator_primitive( "**",    checked_int_power );
operator_primitive( "<<",    checked_int_shift_left );
operator_primitive( ">>",    checked_int_shift_right );
operator_primitive( "AND",   checked_int_and );
operator_primitive( "OR",    checked_int_or );
operator_primitive( "XOR",   checked_int_xor );



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


function unary_boolean_operator( n : ConstText, fun : Function ) : void {
  operator_primitive(
    n,
    function primitive_unary_boolean_operator(){
      const p0 = TOS;
      const r  = fun( value_of( p0 ) );
      de&&mand( r == 0 || r == 1 );
      set_value( p0, r );
      set_type( p0, type_boolean );
    }
  );
}

 /*}*/


/*
 *  ? - operator
 */

const tag_is_truth = tag( "truth?" );

function primitive_is_truth(){
  if( value_of( TOS ) == 0 ){
    set( TOS, type_boolean, tag_is_truth, 0 );
    return;
  }
  if( type_of( TOS ) == type_reference ){
    // ToDo: delegate to some method
    clear( TOS );
    set( TOS, type_boolean, tag_is_truth, 1 );
    return;
  }
  set( TOS, type_boolean, tag_is_truth, 1 );
}
primitive( "truth?", primitive_is_truth );

operator_primitive( "?", primitive_is_truth );


/*
 *  something? - operator, true unless void? is true
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
 *  void? - operator - true when TOS is of type void and value is 0.
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
 *  nothing? - synonym for void?
 */

primitive( "nothing?", primitive_is_void );


/*
 *  true? - operator
 */

const tag_is_true = tag( "true?" );

function primitive_is_true(){
  const typ = type_of( TOS );
  if( typ == type_boolean ){
    if( value_of( TOS ) != 0 ){
      set( TOS, type_boolean, tag_is_true, 1 );
    }else{
      set( TOS, type_boolean, tag_is_true, 0 );
    }
    return;
  }
  clear( TOS );
  set( TOS, type_boolean, tag_is_true, 0 );
}
primitive( "true?", primitive_is_true );

operator_primitive( "true?", primitive_is_true );


/*
 *  false? - operator
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
 *  not - unary boolean operator
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
 *  or - binary boolean operator
 */

function primitive_or(){
  const p2 = pop();
  // check_de&&mand_boolean( TOS );
  if( value_of( TOS ) == 0 ){
    move_cell( p2, TOS );
  }else{
    clear( p2 );
  }
}
operator_primitive( "or", primitive_or );


/*
 *  and - binary boolean operator
 */

const tag_and = tag( "and" );

function primitive_and(){
  const p2 = pop();
  // check_de&&mand_boolean( TOS );
  if( value_of( TOS ) != 0 ){
    clear( TOS );
    move_cell( p2, TOS );
  }else{
    clear( TOS );
    set( TOS, type_boolean, tag_and, 0 );
  }
}
operator_primitive( "and", primitive_and );


/*
 *  Relational boolean operators
 */

/*ts{*/

function checked_int_is_greater_than(){
  const p2 = checked_int_second_parameter();
  const p1 = checked_int_first_parameter();
  if( p1 > p2 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_greater_or_equal(){
  const p2 = checked_int_second_parameter();
  const p1 = checked_int_first_parameter();
  if( p1 >= p2 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_less_than(){
  const p2 = checked_int_second_parameter();
  const p1 = checked_int_first_parameter();
  if( p1 < p2 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_less_or_equal(){
  const p2 = checked_int_second_parameter();
  const p1 = checked_int_first_parameter();
  if( value_of( p1 ) <= value_of( p2 ) ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_equal_to_1(){
  const p1 = checked_int_parameter();
  if( p1 == 1 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_equal_to_minus_1(){
  const p1 = checked_int_parameter();
  if( p1 == -1 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_equal_to_0(){
  const p1 = checked_int_parameter();
  if( p1 == 0 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_not_equal_to_0(){
  const p1 = checked_int_parameter();
  if( p1 != 0 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_less_than_0(){
  const p1 = checked_int_parameter();
  if( p1 < 0 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_greater_than_0(){
  const p1 = checked_int_parameter();
  if( p1 > 0 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_less_or_equal_to_0(){
  const p1 = checked_int_parameter();
  if( p1 <= 0 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


function checked_int_is_greater_or_equal_to_0(){
  const p1 = checked_int_parameter();
  if( p1 >= 0 ){
    set( TOS, type_boolean, tag_boolean, 1 );
  }else{
    set( TOS, type_boolean, tag_boolean, 0 );
  }
}


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


}*/


operator_primitive(  ">",    checked_int_is_greater_than );
operator_primitive(  "<",    checked_int_is_less_than );
operator_primitive(  ">=",   checked_int_is_greater_or_equal );
operator_primitive(  "<=",   checked_int_is_less_or_equal );
operator_primitive(  "=1",   checked_int_is_equal_to_1 );
operator_primitive(  "=-1",  checked_int_is_equal_to_minus_1 );
operator_primitive(  "=0",   checked_int_is_equal_to_0 );
operator_primitive(  "<>0",  checked_int_is_not_equal_to_0 );
operator_primitive(  "<0",   checked_int_is_less_than_0 );
operator_primitive(  "<=0",  checked_int_is_less_or_equal_to_0 );
operator_primitive(  ">0",   checked_int_is_greater_than_0 );
operator_primitive(  ">=0",  checked_int_is_greater_or_equal_to_0 );


/*
 *  Some more arithmetic operators
 */

/*ts{*/

function checked_int_negative(){
  const p1 = checked_int_parameter();
  set( TOS, type_integer, tag_integer, -value_of( p1 ) );
}

function checked_int_sign(){
  const p1 = checked_int_parameter();
  if( p1 < 0 ){
    set( TOS, type_integer, tag_integer, -1 );
  }else{
    set( TOS, type_integer, tag_integer, 1 );
  }
}


function checked_int_abs(){
  const p1 = checked_int_parameter();
  if( p1 < 0 ){
    set( TOS, type_integer, tag_integer, -value_of( p1 ) );
  }else{
    set( TOS, type_integer, tag_integer, value_of( p1 ) );
  }
}


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

}*/

operator_primitive( "NOT",      checked_int_not      );
operator_primitive( "negative", checked_int_negative );
operator_primitive( "sign",     checked_int_sign     );
operator_primitive( "abs",      checked_int_abs      );


/* -------------------------------------------------------------------------
 *  Floating point arithmetic, 32 bits
 */

/*
 *  as-float - convert something into a float
 */

function push_float( f : Float ){
  const c = push();
  // TypeScript version:
  /**/ mem32f[ c ] = f;
  // C++ version:
  //c/ *( float* ) ( ( void* ) ( c << 3 ) ) = f;
  set_info( c, pack( type_float, tag_float ) );
}


function primitive_as_float(){

  const top = pop();

  if( is_a_float_cell( top ) ){
    push();
    return;
  }

  if( is_an_integer_cell( top ) ){
    /**/ const f = mem32f[ top ];
    //c/ auto  f = *( float* ) ( ( void* ) ( top << 3 ) );
    push_float( f );
    return;
  }

  if( is_a_text_cell( top ) ){
    /**/ const f = parseFloat( cell_as_text( top ) );
    //c/ auto  f = (Float) atof( cell_as_text( top ).c_str() );
    push_float( f );
    return;
  }

  const auto_ = cell_as_text( top );
  /**/ const f = parseFloat( auto_ );
  //c/ auto  f = (Float) atof( auto_.c_str() );
  push_float( f );

}
primitive( "as-float", primitive_as_float );


/*
 *  float.as-integer - convert a float to an integer
 */

function pop_float() : Float {
  const top = pop();
  check_de&&mand_cell_type( top, type_float );
  /**/ const f = mem32f[ top ];
  //c/ auto  f = *( float *) ( top << 3 );
  return f;
}


function primitive_float_as_integer(){
  /**/ const f = pop_float();
  /**/ const i = Math.floor( f );
  //c/ auto  f = pop_float();
  //c/ auto  i = ( int ) f;
  push_integer( i );
}
primitive( "float.as-integer", primitive_float_as_integer );


/*
 *  float.as-text - convert a float to a text
 */

function float_as_text( f : Float ) : Text {

  /**/ const buf = f.toString();

  /*c{
    // This is a copilot generated solution, march 23 2023
    // ToDo: test this
    char buf[32];  // buffer for result

    // handle special cases: NaN, infinity, zero
    if ( isnan(f)) {
      memcpy(buf, "nan", 4 );
    } else if ( isinf(f)) {
      if (f > 0) {
        memcpy(buf, "inf", 4 );
      } else {
        memcpy(buf, "-inf", 5);
      }
    } else if (f == 0) {
      memcpy(buf, "0.0", 4 );
    } else {
      // handle sign
      if (f < 0) {
        buf[0] = '-';
        f = -f;
      }
      // handle integer part
      int intPart = (int)f;
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
      float fracPart = f - (float) intPart;
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

  return buf;
}


function primitive_float_as_text(){
  const auto_ = pop_float();
  push_text( float_as_text( auto_ ) );
}


/*
 *  float.add - add a flow to a float
 */

function primitive_float_add(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  // ToDo: should preserve name
  push_float( auto_f1 + auto_f2 );
}
primitive( "float.add", primitive_float_add );


/*
 *  float.subtract - substract two floats
 */

function primitive_float_subtract(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 - auto_f2 );
}
primitive( "float.subtract", primitive_float_subtract );


/*
 *  float.multiply - multiply two floats
 */

function primitive_float_multiply(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 * auto_f2 );
}
primitive( "float.multiply", primitive_float_multiply );


/*
 *  float.divide - divide two floats
 */

function primitive_float_divide(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  push_float( auto_f1 / auto_f2 );
}
primitive( "float.divide", primitive_float_divide );


/*
 *  float.remainder - remainder of two floats
 */

function primitive_float_remainder(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  /**/ const auto_f = auto_f1 % auto_f2;
  //c/ auto  auto_f = fmod( auto_f1, auto_f2 );
  push_float( auto_f );
}
primitive( "float.remainder", primitive_float_remainder );


/*
 *  float.power - power of two floats
 */

function primitive_float_power(){
  const auto_f2 = pop_float();
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.pow( auto_f1, auto_f2 );
  //c/ auto  auto_f = pow( auto_f1, auto_f2 );
  push_float( auto_f );
}


/*
 *  float.sqrt - square root of a float
 */

function primitive_float_sqrt(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.sqrt( auto_f1 );
  //c/ auto  auto_f = sqrt( auto_f1 );
  push_float( auto_f );
}
primitive( "float.sqrt", primitive_float_sqrt );


/*
 *  float.sin - sine of a float
 */

function primitive_float_sin(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.sin( auto_f1 );
  //c/ auto  auto_f = sin( auto_f1 );
  push_float( auto_f );
}
primitive( "float.sin", primitive_float_sin );


/*
 *  float.cos - cosine of a float
 */

function primitive_float_cos(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.cos( auto_f1 );
  //c/ auto  auto_f = cos( auto_f1 );
  push_float( auto_f );
}
primitive( "float.cos", primitive_float_cos );


/*
 *  float.tan - tangent of a float
 */

function primitive_float_tan(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.tan( auto_f1 );
  //c/ auto  auto_f = tan( auto_f1 );
  push_float( auto_f );
}
primitive( "float.tan", primitive_float_tan );


/*
 *  float.asin - arc sine of a float
 */

function primitive_float_asin(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.asin( auto_f1 );
  //c/ auto  auto_f = asin( auto_f1 );
  push_float( auto_f );
}
primitive( "float.asin", primitive_float_asin );


/*
 *  float.acos - arc cosine of a float
 */

function primitive_float_acos(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.acos( auto_f1 );
  //c/ auto  auto_f = acos( auto_f1 );
  push_float( auto_f );
}
primitive( "float.acos", primitive_float_acos );


/*
 *  float.atan - arc tangent of a float
 */

function primitive_float_atan(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.atan( auto_f1 );
  //c/ auto  auto_f = atan( auto_f1 );
  push_float( auto_f );
}
primitive( "float.atan", primitive_float_atan );


/*
 *  float.log - natural logarithm of a float
 */

function primitive_float_log(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.log( auto_f1 );
  //c/ auto  auto_f = log( auto_f1 );
  push_float( auto_f );
}
primitive( "float.log", primitive_float_log );


/*
 *  float.exp - exponential of a float
 */

function primitive_float_exp(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.exp( auto_f1 );
  //c/ auto  auto_f = exp( auto_f1 );
  push_float( auto_f );
}
primitive( "float.exp", primitive_float_exp );


/*
 *  float.floor - floor of a float
 */

function primitive_float_floor(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.floor( auto_f1 );
  //c/ auto  auto_f = floor( auto_f1 );
  push_float( auto_f );
}
primitive( "float.floor", primitive_float_floor );


/*
 *  float.ceiling - ceiling of a float
 */

function primitive_float_ceiling(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.ceil( auto_f1 );
  //c/ auto  auto_f = ceil( auto_f1 );
  push_float( auto_f );
}
primitive( "float.ceiling", primitive_float_ceiling );


/*
 *  float.round - round a float
 */

function primitive_float_round(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.round( auto_f1 );
  //c/ auto  auto_f = round( auto_f1 );
  push_float( auto_f );
}
primitive( "float.round", primitive_float_round );


/*
 *  float.truncate - truncate a float
 */

function primitive_float_truncate(){
  const auto_f1 = pop_float();
  /**/ const auto_f = Math.trunc( auto_f1 );
  //c/ auto  auto_f = trunc( auto_f1 );
  push_float( auto_f );
}
primitive( "float.truncate", primitive_float_truncate );


/* -------------------------------------------------------------------------
 *  Text handling
 */

/*
 *  text.join - text concatenation operator
 */

function primitive_text_join(){
// Text concatenation, t1 t2 -- t3
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_text( auto_t1 + auto_t2 );
}
primitive( "text.join", primitive_text_join );


/*
 *  & - text concatenation binary operator, see text.join
 */

operator_primitive( "&", primitive_text_join );


/*
 *  text.cut - extract a cut of a text, remove a suffix
 */

function primitive_text_cut(){
  const n = pop_integer();
  const auto_ = pop_as_text();
  push_text( tcut( auto_, n ) );
}
primitive( "text.cut", primitive_text_cut );


/*
 *  text.length - length of a text
 */

function primitive_text_length(){
  const auto_ = pop_as_text();
  push_integer( tlen( auto_ ) );
}
primitive( "text.length", primitive_text_length );


/*
 *  text.some? - test if a text is not empty
 */

function primitive_text_some(){
  const auto_ = pop_as_text();
  push_boolean( tsome( auto_ ) );
}
primitive( "text.some?", primitive_text_some );


/*
 *  text.none? - test if a text is empty
 */

function primitive_text_none(){
  const auto_ = pop_as_text();
  push_boolean( tnone( auto_ ) );
}
primitive( "text.none?", primitive_text_none );


/*
 *  text.but - remove a prefix from a text, keep the rest
 */

function primitive_text_but(){
  const n = pop_integer();
  const auto_ = pop_as_text();
  push_text( tbut( auto_, n ) );
}
primitive( "text.but", primitive_text_but );


/*
 *  text.mid - extract a part of the text
 */

function primitive_text_mid(){
  const n = pop_integer();
  const m = pop_integer();
  const auto_ = pop_as_text();
  push_text( tmid( auto_, m, n ) );
}
primitive( "text.mid", primitive_text_mid );


/*
 *  text.at - extract one character at position or "" if out of range
 */

function primitive_text_at(){
  const pos = pop_integer();
  const auto_ = pop_as_text();
  push_text( tat( auto_, pos ) );
}
primitive( "text.at", primitive_text_at );


/*
 *  text.low - convert a text to lower case
 */

function primitive_text_low(){
  const auto_ = pop_as_text();
  push_text( tlow( auto_ ) );
}
primitive( "text.low", primitive_text_low );


/*
 *  text.up - convert a text to upper case
 */

function primitive_text_up(){
  const auto_ = pop_as_text();
  push_text( tup( auto_ ) );
}
primitive( "text.up", primitive_text_up );


/*
 *  text.= - compare two texts
 */

function primitive_text_eq(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_boolean( teq( auto_t1, auto_t2 ) );
}
primitive( "text.=", primitive_text_eq );


/*
 *  text.<> - compare two texts
 */

function primitive_text_neq(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_boolean( tneq( auto_t1, auto_t2 ) );
}
primitive( "text.<>", primitive_text_neq );


/*
 *  text.not= - compare two texts
 */

primitive( "text.not=", primitive_text_neq );


/*
 *  text.find - find a piece in a text, return first position or void
 */

function primitive_text_find(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  const pos = tidx( auto_t1, auto_t2 );
  if( pos < 0 ){
     push();
  }else{
    push_integer( tidx( auto_t1, auto_t2 ) );
  }
}
primitive( "text.find", primitive_text_find );


/*
 *  text.find-last - find a piece in a text, return last position or -1
 */

function primitive_text_find_last(){
  const auto_t2 = pop_as_text();
  const auto_t1 = pop_as_text();
  push_integer( tidxr( auto_t1, auto_t2 ) );
}
primitive( "text.find-last", primitive_text_find_last );


/*
 *  text.start? - operator, test if a text starts another text
 */

function primitive_text_does_start(){
  const auto_txt = pop_as_text();
  const auto_pre = pop_as_text();
  push_boolean( tpre( auto_pre, auto_txt ) );
}
operator_primitive( "text.start?", primitive_text_does_start );


/*
 *  text.start-with? - test if a text starts with a piece
 */

function primitive_text_start_with(){
  const auto_pre = pop_as_text();
  const auto_txt = pop_as_text();
  push_boolean( tpre( auto_pre, auto_txt ) );
}
primitive( "text.start-with?", primitive_text_start_with );


/*
 *  text.end? - operator, test if a text ends another text
 */

function primitive_text_does_end(){
  const auto_txt = pop_as_text();
  const auto_end = pop_as_text();
  push_boolean( tsuf( auto_end, auto_txt ) );
}
operator_primitive( "text.end?", primitive_text_does_end );


/*
 *  text.end-with? - test if a text ends with a piece
 */

function primitive_text_ends_with(){
  const auto_end = pop_as_text();
  const auto_txt = pop_as_text();
  push_boolean( tsuf( auto_end, auto_txt ) );
}

primitive( "text.end-with?", primitive_text_ends_with );



/*
 *  text.line - extract a line from a text at some position
 */

function primitive_text_line(){
  const p = pop_integer();
  const auto_t = pop_as_text();
  push_text( extract_line( auto_t, p, "" ) );
}
primitive( "text.line", primitive_text_line );


/*
 *  text.line-no - extract a line from a text, given a line number
 */

function extract_line_no( lines : Text, line_no : Index ) : Text {

  // Empty if line number, whose start is 1, is out of range
  if( line_no < 1 )return no_text;

  // Skip lines before the desired line
  let lf_index;
  let skipped = 0;
  while( true ){
    lf_index = tidx( lines, "\n" );
    if( lf_index == -1 ){
      if( skipped + 1 == line_no )return lines;
      return no_text;
    }
    lines = tbut( lines, lf_index + 1 );
    skipped = skipped + 1;
    if( skipped + 1 == line_no )break;
  }

  // Is there still a line feed?
  lf_index = tidx( lines, "\n" );
  if( lf_index == -1 )return lines;

  // Return the line before the line feed
  return tcut( lines, lf_index );

}

function primitive_line_no(){
  const line_no = pop_integer();
  push_text( extract_line_no( pop_as_text(), line_no ) );
}
primitive( "text.line-no", primitive_line_no );


/*
 *  as-text - textual representation
 */

function primitive_as_text(){
  if( type_of( TOS ) == type_reference
  && area_tag( value_of( TOS ) ) == tag_text
  )return;
  push_text( pop_as_text() );
}
primitive( "as-text", primitive_as_text );


/*
 *  dump - textual representation, debug style
 */

function primitive_dump(){
  push_text( dump( pop() ) );
}
primitive( "dump", primitive_dump );


/*
 *  ""? - unary operator
 */


const tag_empty_text = tag( "empty?" );

function is_empty_text_cell( c : Cell ) : boolean {
  if( value_of( c ) != the_empty_lean )return false;
  if( type_of(  c ) != type_reference )return false;
  return true;
}


/*
 *  ""? - unary operator - true if TOS is the empty text
 */

const tag_is_empty_text = tag( "\"\"?" );

function primitive_is_empty_text(){
  if( type_of( TOS ) != type_reference ){
    clear( TOS );
    set( TOS, type_boolean, tag_is_empty_text, 0 );
  }else{
    const it_is = is_empty_text_cell( TOS );
    clear( TOS );
    set( TOS, type_boolean, tag_is_empty_text, it_is ? 1 : 0 );
  }
}
operator_primitive( "\"\"?", primitive_is_empty_text );


/*
 *  name - get the name of the TOS value
 */

function primitive_name(){
  const n = name_of( TOS );
  set( TOS, type_tag, tag_name, n );
}
primitive( "name", primitive_name );


/*
 * name! - set the name of the TOS value
 */

function primitive_name_set(){
  const n = pop_tag();
  set_name( TOS, n );
}
primitive( "name!", primitive_name_set );


/*
 *  named? - operator - true if NOS's name is TOS tag
 */

const tag_is_named = tag( "named?" );

function primitive_is_named(){
  const t = pop_tag();
  const c = pop();
  if( name_of( c ) == t ){
    clear( TOS );
    set( TOS, type_boolean, tag_is_named, 1 );
  }else{
    clear( TOS );
    set( TOS, type_boolean, tag_is_named, 0 );
  }
}
primitive( "named?",      primitive_is_named );
operator_primitive( ":?", primitive_is_named );


/* -----------------------------------------------------------------------------
 *
 */

const tag_debug_info = tag( "debug-info" );
const tag_some_file  = tag( "some-file" );

//c/ void primitive_debug_info( void );

function inox_machine_code_cell_as_text( c : Cell ) : Text {
// Decompilation of a single machine code

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

  // If code is a primitive
  if( t == type_primitive ){

    if( get_primitive( n ) == no_operation ){
      return S()+ "Invalid primitive cell " + C( c )
      + " named " + C( n )
      + " (" + ( tag_is_valid( n ) ? tag_as_text( n ) : no_text ) + ")";
    }

    fun = get_primitive( n );
    // Special case for debug-info
    if( fun == primitive_debug_info ){
      return S()
      + "debug-info ( cell " + C( c )
      + ", " + debug_info_as_text( value_of( c ) ) + " )";
    }
    name_text = tag_as_text( n );
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
    name_text = tag_as_text( n );
    return S()+ name_text + " ( cell " + C( c ) + " is a verb )";

  // If code is a literal
  }else{
    return S()+ dump( c ); //  + " ( cell " + C( c ) + " is a literal )";
  }

}


function verb_flags_dump( flags : i32 ) : Text {
// Return a text that describes the flags of an Inox verb
  // Note: the flags parameter should be a u32 but i32 makes things easier
  let auto_ = S();
  if( ( flags & immediate_verb_flag ) == immediate_verb_flag ){
    auto_ += " immediate";
  }
  if( ( flags & hidden_verb_flag ) == hidden_verb_flag ){
    auto_ += " hidden";
  }
  if( ( flags & operator_verb_flag ) == operator_verb_flag ){
    auto_ += " operator";
  }
  if( ( flags & block_verb_flag ) == block_verb_flag ){
    auto_ += " block";
  }
  if( ( flags & inline_verb_flag ) == inline_verb_flag ){
    auto_ += " inline";
  }
  if( ( flags & primitive_verb_flag ) == primitive_verb_flag ){
    auto_ += " primitive";
  }
  return auto_;
}


/*
 *  definition-as-text - decompile a definition
 */

function definition_as_text( def : Cell ) : Text {

  // The prior cell stores flags & length
  let flags_and_length = value_of( def - ONE );
  let flags  = flags_and_length & verb_flags_mask;
  let length = flags_and_length & verb_length_mask;

  // ToDo: add a pointer to the previous verb definition

  let auto_ = S()
  + ": "
  + "( definition at cell " + C( def )
  + ( flags != 0 ? ( S() + ", flags" + verb_flags_dump( flags ) ) : no_text )
  + ", length " + N( length ) + " )\n";

  let ip = 0;
  let c  = 0;

  while( ip < length ){
    c = def + ip * ONE;
    // Filter out final "return"
    if( ip + 1 == length ){
      de&&mand_eq( value_of( c ), 0x0 );
      de&&mand_cell_type(  c, type_void );
      de&&mand_cell_name(  c, type_void );
    }
    auto_ += "( " + N( ip ) + " ) "
    + inox_machine_code_cell_as_text( c ) + "\n";
    ip++;
  }

  return auto_;

}


function primitive_definition_as_text(){
  let def = pop_integer();
  let auto_ = definition_as_text( def );
  push_text( auto_ );
}
primitive( "definition-as-text", primitive_definition_as_text );


/*
 *  verb.as-text-definition - decompile a verb definition
 */

function text_of_verb_definition( id : Index ) : Text {
  // Return the decompiled source code that defines the Inox verb.
  // A non primitive Inox verb is defined using an array of cells that
  // are either other verbs, primitives or literal values

  const auto_text_name = tag_as_text( id );

  // The definition is an array of cells
  const def = definition_of( id );

  const auto_text_def = definition_as_text( def );

  let auto_ = S();
  auto_ += ": " + auto_text_name + " ( definition of " + auto_text_name
  + ", verb " + N( id )
  + ", cell " + C( def )
  + auto_text_def
  + "\n";

  return auto_;
}


function primitive_verb_as_text_definition(){
  let id = pop_verb();
  push_text( text_of_verb_definition( id ) );
}
primitive( "verb.as-text-definition", primitive_verb_as_text_definition );


/*
 *  verb.from - convert into a verb if verb is defined, or void if not
 */

function primitive_verb_from(){
  let top = TOS;
  let typ = type_of( top );
  if( typ == type_tag || typ == type_integer ){
    let id = value_of( top );
    if( ! definition_exists( id ) ){
      reset( top );
      return;
    }
    set_type( top, type_verb );
    set_name( top, id );
    set_value( top, definition_of( id ) );
    return;
  }
  if( typ == type_verb )return;
  let auto_ = pop_as_text();
  if( ! verb_exists( auto_ ) ){
    push();
    return;
  }
  let id = tag( auto_ );
  push();
  set( TOS, type_verb, id, definition_of( id ) );
}
primitive( "verb.from", primitive_verb_from );


/*
 *  primitive.from - convert into a primitive if primitive is defined, or void
 */

function primitive_primitive_from(){
  let top = TOS;
  let typ = type_of( top );
  if( typ == type_tag
  ||  typ == type_integer
  ||  typ == type_verb
  ){
    let id = value_of( top );
    // There is always a verb for a primitive
    if( ! definition_exists( id ) ){
      reset( top );
      return;
    }
    // If the primitive does not exist, use the verb instead
    if( ! primitive_exists( id ) ){
      set_type( top, type_verb );
      set_value( top, definition_of( id ) );
    }else{
      set_type( top, type_primitive );
    }
    set_name( top, id );
    return;
  }
  if( typ == type_primitive )return;
  let auto_ = pop_as_text();
  if( ! verb_exists( auto_ ) ){
    push();
    return;
  }
  let id = tag( auto_ );
  push();
  set( TOS, type_verb, id, definition_of( id ) );
}
primitive( "primitive.from", primitive_primitive_from );


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
 *  peek - get the value of a cell, using a cell's address
 *  This is very low level, it is the Forth @ word (fetch).
 *  Peek/Poke is BASIC style, it is not Forth style.
 */

function primitive_peek(){
  copy_cell( value_of( TOS ), TOS );
}
primitive( "peek", primitive_peek );


/*
 *  poke - set the value of a cell, using a cell's address
 *  This is very low level, it is the Forth ! word (store).
 */

function primitive_poke(){
  const address = pop_integer();
  const top = pop();
  move_cell( top, address );
}
primitive( "poke", primitive_poke );



/*
 *  make.constant - using a value and a name, create a constant
 */

function primitive_make_constant(){
// Create a getter verb that pushes a literal onto the data stack

  // Get value, then name
  const value_cell = pop();

  // Create a verb to get the content, first get it's name
  const auto_ = cell_as_text( TOS );
  de&&mand( tneq( auto_, no_text ) );
  const name_id = tag( auto_ );
  de&&mand_neq( name_id, 0 );
  drop();

  // Allocate space for verb header, value and return instruction
  // Allocate one more cell for the case where it is global variable
  // because small verbs are inlined (when length <= 2), see hack below.
  // ToDo: there could be a "prevent inlining" flag in the verb header
  const header = allocate_cells( 1 + 1 + 1 + 1 );

  // flags and length, length may be patched into 3 by make.variable()
  set( header, type_integer, name_id, 1 + 1 );

  // Skip that header
  const def = header + 1 * ONE;

  // Add Literal value
  move_cell( value_cell, def + 0 * ONE );

  // Add return instruction
  set_return_cell( def + 1 * ONE );

  register_verb_definition( name_id, def );

  if( de ){
    mand_eq( definition_of( name_id ), def );
    mand_eq(
      value_of( definition_of( name_id ) + ONE ),
      0x0000  // return
    );
  }

}
primitive( "make.constant", primitive_make_constant );


/*
 *  define-verb - using a definition and a name, create a verb
 */

function primitive_define_verb(){
  primitive_as_block();
  const top  = pop()
  const name = pop_tag();
  const def  = value_of( top );
  const len  = area_length( def );
  define_verb( name, def, len );
  clear( top );
}
primitive( "define-verb", primitive_define_verb );



/*
 *  tag.defined? - true if text described tag is defined
 */

const tag_is_defined = tag( "defined?" );

function primitive_is_tag_defined(){
  // Return true if the verb is defined in the dictionary
  const name_cell = TOS;
  const auto_ = cell_as_text( name_cell );
  const exists = tag_exists( auto_ );
  clear( name_cell );
  set( name_cell, type_boolean, tag_is_defined, exists ? 1 : 0 );
}
primitive( "tag.defined?", primitive_is_tag_defined );


/*
 *  verb.defined? - true if text described verb is defined
 */

function primitive_is_verb_defined(){
// Return true if the name is defined in the dictionary
  const auto_ = pop_as_text();
  const exists = verb_exists( auto_ );
  push();
  set( TOS, type_boolean, tag_is_defined, exists ? 1 : 0 );
}
primitive( "verb.defined?", primitive_is_verb_defined );


/*
 *  tag.to_verb - convert a tag to a verb or void
 */

function primitive_tag_to_verb(){
  const tag = pop_tag();
  const auto_ = tag_as_text( tag );
  if( ! verb_exists( auto_ ) ){
    push();
    return;
  }
  const def = find_definition_by_name( auto_ );
  push();
  set( TOS, type_verb, tag, def );
}
primitive( "tag.to-verb", primitive_tag_to_verb );


/*
 *  make.global - create a global variable and verbs to get/set it
 *  Getter is named like the variable, setter is named like the variable with
 *  a "!" suffix.
 */

const tag_peek = tag( "peek" );
const tag_poke = tag( "poke" );

function  primitive_make_global(){

  // Create a getter verb to read the global variable like constants does
  primitive_2dup();
  primitive_make_constant();

  drop();
  const name_id = pop_tag();

  // Patch the length to avoid inlining of short verbs, a big hack!
  const getter_def = definition_of( name_id );
  de&&mand_eq( definition_length( getter_def ), 2 );
  set_definition_length( getter_def, 3 );  // ToDo: harmfull big hack?

  // Create a setter verb to write the global variable, xxx!
  const auto_verb_name   = tag_as_text( name_id );
  const auto_setter_name = auto_verb_name + "!";
  const setter_name_id   = tag( auto_setter_name );

  // Allocate space for verb header, cell address, setter and return instruction
  let setter_header = allocate_cells( 1 + 3 );

  // flags and length need an extra word, so does the ending "return"
  set( setter_header, type_integer, setter_name_id, 1 + 1 + 1 + 1 );

  // Skip that header
  const setter_def = setter_header + 1 * ONE;

  // Use the address of the cell in the constant as the parameter for poke
  set( setter_def, type_integer, name_id, getter_def );

  // Add call to primitive poke to set the value when verb runs
  set( setter_def + 1 * ONE, type_primitive, tag_poke, 0 );

  // Add return instruction
  set_return_cell( setter_def + 2 * ONE );

  register_verb_definition( setter_name_id, setter_def );

  // Create a constant named @xxx to get the address of the variable
  // const at_name_id = tag( "@" + name );
  // set_value( name_cell, at_name_id );
  // primitive_make_constant();
  // const at_def = definition_of( at_name_id );
  // ToDo: store address as cell-pointer type, not as an integer
  // set( at_def, type_integer, at_name_id, getter_def );

}
primitive( "make.global", primitive_make_global );


/*
 *  make.local - create a local variable in the control stack
 */

function primitive_make_local(){
  const n = pop_tag();
  // the return value on the top of the control stack must be preserved
  const old_csp = CSP;
  CSP += ONE;
  move_cell( old_csp, CSP );
  move_cell( pop(), old_csp );
  set_name( old_csp, n );
}
primitive( "make.local", primitive_make_local );

const tag_with = tag( "with" );

function is_block( c : Cell ) : boolean {
  // ToDo: should check header of block, ie length & mask
  // ToDo: should be a type_pointer (or type_address maybe)
  // ToDo: type pointer for smart pointers, type address for raw pointers
  // ToDo: type_pointer would be for addresses of dynamic areas
  // No type checking in fast mode
  if( ! check_de )return true;
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
 *  with? - true if the cell is a with sentinel
 */

function is_with( c : Cell ) : boolean {
  // ToDo: optimize this
  return type_of(  c ) == type_tag
  &&     name_of(  c ) == tag_with
  &&     value_of( c ) == tag_with;
}

const tag_is_with = tag( "with?" );

function primitive_is_with(){
  const is_it = is_with( TOS );
  if( is_it ){
    set( TOS, type_boolean, tag_is_with, 1 );
  }else{
    clear( TOS );
    set( TOS, type_boolean, tag_is_with, 0 );
  }
}
primitive( "with?", primitive_is_with );


/*
 *  forget-parameters - internal, return from function with parameters
 */

const tag_forget_parameters = tag( "forget-parameters" );
const tag_rest  = tag( "rest" );

function primitive_forget_parameters(){

  // ToDo: the limit should be the base of the control stack
  let limit = 0;
  if( check_de ){
    limit = ACTOR_control_stack;
  }

  while( is_with( CSP ) ){
    drop_control();
    if( check_de && CSP < limit ){
      FATAL( "/with sentinel out of reach" );
      debugger;
    }
  }

  // Clear the sentinel
  raw_drop_control();

  // Jump to the return address
  pop_ip();

}
primitive( "forget-parameters", primitive_forget_parameters );


/*
 *  run-with-parameters - run a block with the "function" protocol
 */

const tag_run_with_parameters = tag( "run-with-parameters" );

// In C++, the definition is available later, see init_globals()
let forget_parameters_definition = 0;
// = definition_of( tag_forget_parameters );


function primitive_run_with_parameters(){
// Create variables in the control stack for verbs with formal parameters.
// Up to with sentinel. Usage : with a/ b/ { xxx } run-with-parameters

  const block = pop_block();
  call( tag_run_with_parameters, block );

  let new_tos = TOS;

  // Count formal parameters up to /with sentinel included
  let count = 0;
  let parameter_name;
  while( true ){
    parameter_name = name_of( new_tos );
    count++;
    if( parameter_name == tag_rest ){
      // ToDo: special /rest parameter should make a list object with the rest
    }
    if( is_with( new_tos ) )break;
    if( count > 10 ){
      bug( "Too many parameters, more then ten" );
      debugger;
      break;
    }
    new_tos -= ONE;
  }

  // Set value of parameters using values from the data stack
  let copy_count = 0;
  let n;

  // Go from sentinel argument back to tos, push each actual parameter
  const sentinel_tos = new_tos;
  let actual_argument_cell  = CSP;
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

  CSP = actual_argument_cell - ONE;

  // Schedule call to the parameters remover
  defer( tag_forget_parameters, forget_parameters_definition );

}
primitive( "run-with-parameters", primitive_run_with_parameters );


/*
 *  parameters - create local variables for the parameters of a verb
 */

function primitive_parameters(){
  const top = TOS;
  // Push /with sentinel onto control stack
  CSP += ONE;
  set( CSP, type_tag, tag_with, tag_with );
  // Push parameters onto control stack
  const csp = CSP;
  let name;
  let nparams = 0;
  while( true ){
    // ToDo: optional default value for when argument is void
    if( is_with( TOS ) ){
      raw_drop();
      break;
    }
    name = pop_tag();
    CSP += ONE;
    set( CSP, type_void, name, 0 );
    nparams++;
  }
  // Now eat values from the data stack to initialize the parameters
  let ii;
  for( ii = 1 ; ii <= nparams ; ii++ ){
    // ToDo: optimize this
    name = name_of( csp + ii * ONE );
    move_cell( pop(), csp + ii * ONE );
    set_name( csp + ii * ONE, name );
  }
  // Schedule call to the parameters remover
  defer( tag_forget_parameters, forget_parameters_definition );
}
primitive( "parameters", primitive_parameters );


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
        FATAL( "Local variable not found, named " + tag_as_text( n ) );
        return;
      }
    }
  }
  copy_cell( ptr, TOS );
}
primitive( "local", primitive_local );


/*
 *  inlined-local - copy a control variable to the data stack, internal
 */

const tag_cached_local = tag( "cached-local" );

function primitive_cached_local(){
// Copy the value of a control variable from the control stack to the data one
  // This primitive is always inlined, the name comes next in the definition
  const cache = value_of( IP );
  const previous_ip = IP - ONE;
  // If cached, use the cached value if still valid
  if( cache != 0 ){
    // Cache is valid if CSP is identical to what it was when last cached
    if( CSP == value_of( previous_ip ) ){
      if( check_de ){
        mand_cell_name( cache, name_of( IP ) );
        mand_cell_type( cache, type_integer );
      }
      copy_cell( value_of( cache ), push() );
      return;
    }
  }
  // Starting from the top of the control stack, find the variable
  const n = name_of( IP );
  // Skip the top of the control stack because it is a return address
  let ptr = CSP - ONE;
  while( name_of( ptr ) != n ){
    ptr -= ONE;
    if( check_de ){
      if( ptr < ACTOR_control_stack ){
        FATAL( "Local variable not found, named " + tag_as_text( n ) );
        return;
      }
    }
  }
  copy_cell( ptr, push() );
  // Check the validity of the cache cell inside the definition
  if( check_de ){
    mand_cell_type( IP, type_integer );
  }
  // Cache the value
  set_value( previous_ip, CSP );
  set_value( IP, ptr );
  // Skip the cell with the name of the variable
  IP += ONE;
}
primitive( "cached-local", primitive_cached_local );


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
        FATAL( "Local variable not found, named " + tag_as_text( n ) );
        return;
      }
    }
  }
  move_cell( pop(), ptr );
  set_name( ptr, n );
}
primitive( "local!", primitive_set_local );


/*
 *  data - lookup for a named value in the data stack and copy it to the top
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
        FATAL( "Data variable not found, named " + tag_as_text( n ) );
        return;
      }
    }
  }
  // Found it, copy it to TOS
  copy_cell( ptr, TOS );
}
primitive( "data", primitive_data );


/*
 *  set-data - change the value of an existing data variable
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
        FATAL( "Data variable not found, named " + tag_as_text( n ) );
        return;
      }
    }
  }
  // Found it, change value
  move_cell( pop(), ptr );
  // But keep the name
  set_name( ptr, n );
}
primitive( "data!", primitive_set_data );


/*
 *  size-of-cell - constant that depends on the platform, 8 for now
 */

function primitive_size_of_cell(){
  set( push(), type_integer, tag( "size-of-cell" ), size_of_cell );
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
 *  data-index - find the position of a data variable in the data stack
 */

function primitive_data_index(){
  check_de&&mand_cell_type( TOS, type_tag );
  const name = value_of( TOS );
  let ptr = TOS - ONE;
  let index = 1;
  while( name_of( ptr ) != name ){
    ptr -= ONE;
    if( stack_de ){
      if( ptr < ACTOR_data_stack ){
        FATAL( "Data variable not found, named " + tag_as_text( name ) );
        return;
      }
    }
    index++;
  }
  set( TOS, type_integer, tag( "data-index" ), index );
}
primitive( "data-index", primitive_data_index );


/*
 *  upper-local - non local access to a local variable
 *  ToDo: should be previous-local, it is actually lower in the stack
 */

function primitive_upper_local(){
// Get the value of the nth named value inside the control stack, or void
  const nth = pop_integer();
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
 *  upper-data - non local access to a data variable
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
    move_cell( pop(), found );
  }else{
    FATAL( S()+ "Control nth" + N( nth )
    + " variable not found, named " + tag_as_text( n ) );
  }
}
primitive( "upper-local!", primitive_set_upper_local );


/*
 *  set-upper-data - set a data variable in the nth upper frame
 */

function primitive_set_upper_data(){
  const nth   = pop_integer();
  const n     = pop_tag();
  const found = cell_lookup( TOS - ONE, ACTOR_data_stack, n, nth );
  if( found ){
    move_cell( TOS, found );
  }else{
    FATAL( "Data nth" + N( nth )
    + " variable not found, named " + tag_as_text( n ) );
  }
}


/*
 *  forget-data - remove stack elements until a previous variable, included
 *  ToDo: rename? remove-data? drop-data? pop-data, something else?
 */

function primitive_forget_data(){
  const n = pop_tag();
  while( name_of( TOS ) != n ){
    clear( TOS );
    TOS -= ONE;
    if( TOS < ACTOR_data_stack ){
      FATAL( "data-without, missing " + tag_as_text( n ) );
      return;
    }
  }
  clear( TOS );
  TOS -= ONE;
}
primitive( "forget-data", primitive_forget_data );


/* -----------------------------------------------------------------------------
 *  Object creation and access to the it variable.
 */

// Javascript uses "this", some other languages use "self".
const tag_it = tag( "it" );

/*ts{*/

const tag_map = tag( "map" );

function make_circular_object_from_js( obj : any, met : Map< string, any> ) : Cell {

  // The first item is the name of the class.
  const class_name = tag( obj.constructor.name );

  // How many properties are there inside that object?
  const keys = obj.keys();
  const length = keys.length;

  // Allocate enough memory to hold all of that
  const area = allocate_area( tag_map, length * size_of_cell );

  // First cell is name:length
  init_cell( area, length, pack( type_integer, class_name ) );
  let top = area + size_of_word;

  // Them come the properties, numeric indices first, then named
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
      if( tneq( typeof key, "number" ) ){
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

    if( teq( js_type, "number" ) ){
      if( Number.isInteger( val ) ){
        c = allocate_cell();
        set_integer_cell( c, val );
      }else{
        // ToDo: c = make_float_cell( val )
      }

    }else if( teq( js_type, "boolean" ) ){
      c = allocate_cell();
      set_integer_cell( c, val ? 1 : 0 );

    }else if( teq( js_type, "string" ) ){
      c = allocate_cell();
      set_text_cell( c, val );

    }else if( teq( js_type, "object" ) ){
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


function  object_length( area : Cell ) : Count {
// Get the number of cells of the object
  // This does not include the headers used for memory management
  const length = area_length( area );
  return length;
}


/*
 *  make.fixed-object - create a fixed size object
 *  On extensible objects, more push and pop operations are anticipated
 *  Implementation may detect when object is full and need to be extended.
 */

const tag_out_of_memory = tag( "out-of-memory" );

function primitive_make_fixed_object(){

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
  check_de&&mand( length >= 0 && length < 1000 );

  // Allocate cells for the values
  const dest_area = allocate_area( class_name, max_length * size_of_cell );
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
    raw_move_cell( pop(), dest_area + ii * ONE );
  }

  de&&mand_eq( area_length( dest_area ), length );
  de&&mand_eq( area_tag(    dest_area ), class_name );

  // Return the named reference to the object
  set( push(), type_reference, class_name, dest_area );
}
primitive( "make.fixed-object", primitive_make_fixed_object );



/*
 *  make.object - create an object of the given length
 */

function primitive_make_object(){
  // The length and the capacity are the same
  primitive_duplicate();
  // That's just a fixed object with no room for more attributes!
  primitive_make_fixed_object();
}
primitive( "make.object", primitive_make_object );


/*
 *  make.extensible-object - create an empty object with some capacity
 */

function primitive_make_extensible_object(){
  // Get the class name and the initial capacity
  const class_name = name_of( TOS );
  check_de&&mand_cell_type( TOS, type_integer );
  // Allocate the object, it will hold a single value, a reference
  const obj = allocate_area( class_name, size_of_cell );
  const capacity = value_of( TOS );
  // Allocate the extension area that the object will point to
  const area = allocate_area( class_name, ( capacity + 1 ) * size_of_cell );
  if( area == 0 ){
    FATAL( "out-of-memory" );
    return 0;
  }
  // Initialize the object so that it points to the extension area
  set( obj, type_reference, class_name, area );
  // Initialize the length of the extension, empty for now
  set( area, type_integer, tag_extension_length, 0 );
  // Return the named reference to the object
  set_type( TOS, type_reference );
  set_value( TOS, obj );
}
primitive( "make.extensible-object", primitive_make_extensible_object );


/*
 *  extend-object - turn a fixed object into an extensible one
 */

function primitive_extend_object(){
// Turn a fixed object into an extensible one

  const obj = pop_reference();
  const len = object_length( obj );

  // Silently ignore if alreay extended
  if( type_of( obj ) == type_reference ){
    return;
  };

  // Allocate the extended area
  const area = allocate_area( name_of( obj ), len * size_of_cell );
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
primitive( "extend-object", primitive_extend_object );


/*
 *  object.@ - access a data member of an object
 */


function object_get( ptr : Cell, n : Tag ) : Cell {
// Get the value of a data member of an object

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

  while( name_of( ptr ) != n ){
    // ToDo: go backward? That would process the array as a stack
    ptr += ONE;
    if( check_de && limit != 0 ){
      if( ptr > limit ){
        return 0;
      }
    }
  }

  // Found
  return ptr
}


function primitive_object_at(){
// Copy the value of an instance variable from an object

  const top = pop();
  const obj = TOS;
  let ptr = value_of( obj );

  // Void from void
  if( ptr == 0x0 ){
    de&&mand( info_of( obj ) == 0 );
    clear( top );
    clear( obj );
    return;
  }

  if( check_de ){
    mand_tag( top );
    mand_cell_type( obj, type_reference );
    // ToDo: fatal error
  }

  ptr = object_get( ptr, value_of( top ) );
  if( ptr == 0 ){
    FATAL(
      "Object variable not found, named "
      + tag_as_text( value_of( top ) )
    );
    return;
  }

  clear( top );
  clear( obj );
  copy_cell( ptr, obj );

}
primitive( "object.@", primitive_object_at );


/*
 *  object.?@ - access a data member of an object, void if impossible
 */

function primitive_object_nice_at(){
// Copy the value of an instance variable from an object

  const top = pop();
  const obj = TOS;
  let ptr = value_of( obj );

  // Void from void
  if( ptr == 0x0 ){
    de&&mand( info_of( obj ) == 0 );
    clear( top );
    clear( obj );
    return;
  }

  if( check_de ){
    mand_tag( top );
    mand_cell_type( obj, type_reference );
    // ToDo: fatal error
  }

  ptr = object_get( ptr, value_of( top ) );

  clear( top );
  clear( obj );

  if( ptr == 0 ){
    return;
  }
  copy_cell( ptr, obj );

}
primitive( "object.?@", primitive_object_nice_at );


/*
 *  object.contain? - check if an object has a data member
 */

const tag_contains = tag( "contain?" );

function primitive_object_contains(){
  const top = pop();
  const obj = TOS;
  let ptr = value_of( obj );

  // False from void
  if( ptr == 0x0 ){
    de&&mand( info_of( obj ) == 0 );
    clear( top );
    clear( obj );
    set( TOS, type_boolean, tag_contains, 0 );
    return;
  }

  if( check_de ){
    mand_tag( top );
    mand_cell_type( obj, type_reference );
    // ToDo: fatal error
  }

  ptr = object_get( ptr, value_of( top ) );

  clear( top );
  clear( obj );

  if( ptr == 0 ){
    set( TOS, type_boolean, tag_contains, 0 );
  }else{
    set( TOS, type_boolean, tag_contains, 1 );
  }
}
operator_primitive( "object.contain?", primitive_object_contains );


/*
 *  in? - swap and call .contain?
 */

function primitive_is_in(){
  primitive_swap();
  push_tag( tag_contains );
  primitive_run_method();
}
operator_primitive( "in?", primitive_is_in );


/*
 *  object.! - change a data member of an object
 */

function primitive_object_set(){
// Set the value of an instance variable, aka attribute, of an object

  const top = pop();
  const n   = pop_tag();

  check_de&&mand_cell_type( TOS, type_reference );
  const obj = pop();
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
        FATAL( "Object variable not found, named " + tag_as_text( n ) );
        return;
      }
    }
  }

  // ToDo: optimize this, the target name is already ok
  reset( ptr );
  move_cell( top, ptr );

  // Restore initial name
  set_name( ptr, n );
  // ToDo: the obj is not clear
  clear( obj );

}
primitive( "object.!", primitive_object_set );


/*
 *  object.?! - change a data member of an object if possible
 */

// ToDo: implement it



/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object
 */


/*
 *  stack.pop - pop a value from a stack object
 */

function primitive_stack_pop(){
  let target = pop_reference();
  // Auto dereference
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    FATAL( "stack.pop, empty stack" );
    return;
  }
  move_cell( target + length * ONE, push() );
  set_value( target, length - 1 );
}
primitive( "stack.pop", primitive_stack_pop );


/*
 *  stack.push - push a value onto a stack object
 */

function primitive_stack_push(){
  const value_cell = pop();
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  move_cell( value_cell, target + length * ONE );
  set_value( target, length + 1 );
}
primitive( "stack.push", primitive_stack_push );


/*
 *  stack.drop - drop the top of a stack object
 */

function primitive_stack_drop(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    FATAL( "stack.drop, empty stack" );
    return;
  }
  clear( target + length * ONE );
  set_value( target, length - 1 );
}
primitive( "stack.drop", primitive_stack_drop );


/*
 *  stack.drop-nice - drop the tof of a stack object, unless empty
 */

function primitive_stack_drop_nice(){
  // Pop a value from the stack of an object, no error if stack is empty
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 )return;
  clear( target + length * ONE );
  set_value( target, length - 1 );
}
primitive( "stack.drop-nice", primitive_stack_drop_nice );


/*
 *  stack.fetch - get the nth entry of a stack object
 */

function primitive_stack_fetch(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    FATAL( "stack.fetch, empty stack" );
    return;
  }
  // ToDo: handle negative indices where -1 is the older item in the stack
  let index = pop_integer();
  if( index < 0 ){
    index += length;
  }
  if( index < 0 || index >= length ){
    FATAL( "stack.fetch, index out of range" );
    return;
  }
  copy_cell( target + index * ONE, push() );
}
primitive( "stack.fetch", primitive_stack_fetch );


/*
 *  stack.fetch-nice - get the nth entry of a stack object, or void
 */

function primitive_stack_fetch_nice(){
// Fetch a value from the stack of an object, no error if stack is empty
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length == 0 ){
    push();
    return;
  }
  let index = pop_integer();
  if( index < 0 ){
    index += length;
  }
  if( index < 0 || index >= length ){
    push();
    return;
  }
  copy_cell( target + index * ONE, push() );
}
primitive( "stack.fetch-nice", primitive_stack_fetch_nice );


/*
 *  stack.length - get the depth of a stack object
 */

function primitive_stack_length(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  push_integer( length );
}
primitive( "stack.length", primitive_stack_length );


/*
 *  stack.capacity - get the capacity of a stack object
 */

const tag_stack_capacity = tag( "stack.capacity" );

function primitive_stack_capacity(){
  let target = pop_reference();
  push_integer( stack_capacity( target ) );
  set_tos_name( tag_stack_capacity );
}
primitive( "stack.capacity", primitive_stack_capacity );


/*
 *  stack.duplicate - duplicate the top of a stack object
 */

function primitive_stack_duplicate(){
  stack_duplicate( pop_reference() );
}
primitive( "stack.duplicate", primitive_stack_duplicate );


/*
 *  stack.top - get the top of a stack object, like duplicate
 */

function primitive_stack_top(){
  stack_duplicate( pop_reference() );
}
primitive( "stack.top", primitive_stack_top );


/*
 *  stack.clear - clear a stack object
 */

function primitive_stack_clear(){
  stack_clear( pop_reference() );
}
primitive( "stack.clear", primitive_stack_clear );


/**/ function swap_cell( c1 : Cell, c2 : Cell ){
//c/ void swap_cell( Cell c1, Cell c2 ) {
  move_cell( c1, the_tmp_cell );
  move_cell( c2, c1 );
  move_cell( the_tmp_cell, c2 );
}


/*
 *  stack.swap - swap the top two values of a stack object
 */

function primitive_stack_swap(){
  let target = pop_reference();
  if( type_of( target ) == type_reference ){
    target = reference_of( target );
  }
  const length = value_of( target );
  if( length < 2 ){
    FATAL( "stack.swap, stack too short" );
    return;
  }
  swap_cell( target, target - 1 * ONE );
}
primitive( "stack.swap", primitive_stack_swap );


/*
 *  stack.swap-nice - like swap but ok if stack is too short
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
primitive( "stack.swap-nice", primitive_stack_swap_nice );


/*
 *  stack.enter - swith stack to the stack of an object
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
primitive( "stack.enter", primitive_stack_enter );


/*
 *  stack.leave - revert to the previous data stack
 */

function primitive_stack_leave(){

  TOS = eat_reference( CSP );
  CSP -= ONE;

  ACTOR_data_stack_limit = eat_integer( CSP );
  CSP -= ONE;

  ACTOR_data_stack = eat_integer( CSP );
  CSP -= ONE;

}
primitive( "stack.leave", primitive_stack_leave );


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
  const new_stack_area = allocate_area( tag_stack, new_length * size_of_cell );
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
  const new_stack = allocate_area( tag_stack, new_length * size_of_cell );
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
 *  queue.push - add an element to the queue
 */

function primitive_queue_push(){
  primitive_stack_push();
}
primitive( "queue.push", primitive_queue_push );


/*
 *  queue.length - number of elements in the queue
 */

function primitive_queue_length(){
  primitive_stack_length();
}
primitive( "queue.length", primitive_queue_length );


/*
 *  queue.pull - extract the oldest element from the queue
 */

function primitive_queue_pull(){

  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value_of( TOS );
  clear( TOS );
  pop();
  const queue_length = value_of( queue );
  if( queue_length + 1 >= to_cell( area_size( queue ) ) ){
    FATAL( "queue.pull, queue overflow" );
    return;
  }
  // Make room for new element
  let ii;
  for( ii = queue_length ; ii > 0 ; ii-- ){
    move_cell( queue + ii * ONE, queue + ( ii + 1 ) * ONE );
  }
  // Push new element
  move_cell( pop(), queue + ONE );
}
primitive( "queue.pull", primitive_queue_pull );


/*
 *  queue.capacity - maximum number of elements in the queue
 */

const tag_queue_capacity = tag( "queue.capacity" );

function primitive_queue_capacity(){
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value_of( TOS );
  clear( TOS );
  pop();
  const queue_capacity = to_cell( area_size( queue ) );
  push_integer( queue_capacity - 1 );
  set_tos_name( tag_queue_capacity );
}
primitive( "queue.capacity", primitive_queue_capacity );


/*
 *  queue.clear - make the queue empty
 */

function primitive_queue_clear(){
  check_de&&mand_cell_type( TOS, tag_reference );
  const queue = value_of( TOS );
  clear( TOS );
  pop();
  const queue_length = value_of( queue );
  let ii;
  for( ii = 0 ; ii < queue_length ; ii++ ){
    clear( queue + ( ii + 1 ) * ONE );
  }
  set_value( queue, 0 );
}
primitive( "queue.clear", primitive_queue_clear );


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as an array
 */

/*
 *  array.put - set the value of the nth element
 */

function primitive_array_put(){
  const value_cell = TOS;
  const index_cell = TOS - ONE;
  check_de&&mand_integer( index_cell );
  let   index = value_of( index_cell );
  const array_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_length = value_of( array );
  const array_capacity = to_cell( area_size( array ) );
  // Handle negative indices
  if( index < 0 ){
    index += array_length;
  }
  if( index >= array_capacity ){
    FATAL( "array.put, index out of range" );
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
primitive( "array.put", primitive_array_put );


/*
 *  array.get - nth element
 */

function primitive_array_get(){
  const index_cell = TOS;
  check_de&&mand_integer( index_cell );
  let   index = value_of( index_cell );
  const array_cell = TOS - ONE;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_length = value_of( array );
  // Handle negative indices
  if( index < 0 ){
    index += array_length;
  }
  if( index >= array_length ){
    FATAL( "array.get, index out of range" );
    return;
  }
  reset( index_cell );
  copy_cell( array + ( index + 1 ) * ONE, TOS );
  clear( array_cell );
  TOS -= 2 * ONE;
}
primitive( "array.get", primitive_array_get );


/*
 *  array.length - number of elements in an array
 */

const tag_array_length = tag( "array.length" );

function primitive_array_length(){
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_length = value_of( array );
  clear( array_cell );
  set( TOS, type_integer, tag_array_length, array_length );
}
primitive( "array.length", primitive_array_length );


/*
 *  array.capacity - return the capacity of an array
 */

const tag_array_capacity = tag( "array.capacity" );

function primitive_array_capacity(){
  const array_cell = TOS;
  check_de&&mand_cell_type( array_cell, tag_reference );
  const array = value_of( array_cell );
  const array_capacity = to_cell( area_size( array ) );
  clear( array_cell );
  set( TOS, type_integer, tag_array_capacity, array_capacity - 1 );
}
primitive( "array.capacity", primitive_array_capacity );


/*
 *  array.remove - remove the nth element
 */

function primitive_array_remove(){
  let array = pop_reference();
  if( type_of( array ) == type_reference ){
    array = value_of( array );
  }
  const nth = pop_integer();
  const array_length = value_of( array );
  // Handle negative indices
  let index = nth;
  if( index < 0 ){
    index += array_length;
  }
  if( check_de && index >= array_length ){
    FATAL( "array.remove, index out of range" );
    return;
  }
  // Shift elements
  let ii;
  for( ii = index ; ii < array_length - 1 ; ii++ ){
    move_cell( array + ( ii + 2 ) * ONE, array + ( ii + 1 ) * ONE );
  }
  // Update length
  set_value( array, array_length - 1 );
}


/*
 *  array.index - return the index of a value in an array or -1
 */

const tag_index = tag( "index" );

function primitive_array_index(){
  let array = pop_reference();
  if( type_of( array ) == type_reference ){
    array = value_of( array );
  }
  const value = TOS;
  const array_length = value_of( array );
  let ii;
  for( ii = 0 ; ii < array_length ; ii++ ){
    if( value_of( array + ( ii + 1 ) * ONE ) == value_of( value )
    &&  type_of(  array + ( ii + 1 ) * ONE ) == type_of(  value )
    ){
      break;
    }
  }
  if( ii == array_length ){
    ii = -1;
  }
  clear( TOS );
  set( TOS, type_integer, tag_index, ii );
}
primitive( "array.index", primitive_array_index );


/*
 *  array.tag-index - return the index of a variable in an array or -1
 */

function primitive_array_tag_index(){
  let array = pop_reference();
  if( type_of( array ) == type_reference ){
    array = value_of( array );
  }
  const value = TOS;
  check_de&&mand_cell_type( value, type_tag );
  const name = value_of( value );
  const array_length = value_of( array );
  let ii;
  for( ii = 0 ; ii < array_length ; ii++ ){
    if( value_of( array + ( ii + 1 ) * ONE ) == name
    &&  type_of(  array + ( ii + 1 ) * ONE ) == type_tag
    ){
      break;
    }
  }
  if( ii == array_length ){
    ii = -1;
  }
  set( TOS, type_integer, tag_index, ii );
}
primitive( "array.tag-index", primitive_array_tag_index );


/* ----------------------------------------------------------------------------
 *  Primitives to handle the stack of an object as a map
 */

/*
 *  map.put - put a value in a map
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
  // ToDo: some caching, based on the name of the map and/or it's address
  let ii = 0;
  while( ii < map_length ){
    if( name_of( map + ( ii + 1 ) * ONE ) == name_id ){
      break;
    }
    ii++;
  }
  if( ii == map_capacity ){
    FATAL( "map.put, map full" );
    return;
  }
  if( ii == map_length ){
    set_value( map, map_length + 1 );
  }
  move_cell( value_cell, map + ( ii + 1 ) * ONE );
  TOS -= 3 * ONE;
}
primitive( "map.put", primitive_map_put );


/*
 *  map.get - get a value from a map
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
    FATAL( "map.get, key not found" );
    return;
  }
  reset( key_cell );
  pop();
  clear( map_cell );
  copy_cell( map + ( ii + 1 ) * ONE, TOS );
}
primitive( "map.get", primitive_map_get );


/*
 *  map.nice-get - get a value from a map, void if impossible
 *  usage: map.nice-get( map, key ) > value
 */

function primitive_map_nice_get(){
  const key_cell = TOS;
  if( type_of( key_cell ) != type_tag ){
    reset( key_cell );
    pop();
    clear( TOS );
    return;
  }
  const map_cell = TOS - ONE;
  if( type_of( map_cell ) != type_reference ){
    reset( key_cell );
    pop();
    reset( TOS );
    return;
  }
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
    reset( key_cell );
    pop();
    clear( TOS );
    return;
  }
  reset( key_cell );
  pop();
  clear( map_cell );
  copy_cell( map + ( ii + 1 ) * ONE, TOS );
}
primitive( "map.nice-get", primitive_map_nice_get );


/*
 *  map.?@ - get a value from a map, void if impossible
 */

function primitive_map_question_get(){
  primitive_swap();
  primitive_map_nice_get();
}
primitive( "map.?@", primitive_map_question_get );


/*
 *  map.length - number of elements in a map
 */

const tag_map_length = tag( "map.length" );

function primitive_map_length(){
  const map_cell = TOS;
  check_de&&mand_cell_type( map_cell, tag_reference );
  const map = value_of( map_cell );
  const map_length = value_of( map );
  clear( map_cell );
  set( TOS, type_integer, tag_map_length, map_length );
  set_tos_name( tag_map_length );
}
primitive( "map.length", primitive_map_length );


/* ----------------------------------------------------------------------------
  *  Primitives to handle the stack of an object as a set
  */

/*
  *  set.put - put a value in a set
  */

function primitive_set_put(){
  const value_cell = TOS;
  const name_id = name_of( value_cell );
  const set_cell = TOS - 2 * ONE;
  check_de&&mand_cell_type( set_cell, tag_reference );
  const set = value_of( set_cell );
  const set_length = value_of( set );
  const set_capacity = to_cell( area_size( set ) );
  // Search for the key
  let ii;
  for( ii = 0; ii < set_length; ii++ ){
    if( name_of( set + ( ii + 1 ) * ONE ) == name_id ){
      // Already in the set, update the value
      clear( set + ( ii + 1 ) * ONE );
      move_cell( value_cell, set + ( ii + 1 ) * ONE );
      TOS -= 3 * ONE;
      return;
    }
  }
  if( set_length == set_capacity ){
    FATAL( "set.put, set full" );
    return;
  }
  set_value( set, set_length + 1 );
  move_cell( value_cell, set + ( set_length + 1 ) * ONE );
  TOS -= 3 * ONE;
}
primitive( "set.put", primitive_set_put );


/*
 *  set.get - access a set element using a tag
 */

function primitive_set_get(){
  const key_cell = TOS;
  de&&mand_tag( key_cell );
  const set_cell = TOS - ONE;
  check_de&&mand_cell_type( set_cell, tag_reference );
  const set = value_of( set_cell );
  const set_length = value_of( set );
  // Search for the key
  let ii;
  for(  ii = 0 ; ii < set_length ; ii++ ){
    if( name_of( set + ( ii + 1 ) * ONE ) == name_of( key_cell ) ){
      // Found the key, return the value
      reset( key_cell );
      copy_cell( set + ( ii + 1 ) * ONE, TOS );
      clear( set_cell );
      TOS -= 2 * ONE;
      return;
    }
  }
  // Key not found
  FATAL( "set.get, key not found" );
  return;
}
primitive( "set.get", primitive_set_get );


/*
 *  set.length - number of elements in a set
 */

const tag_set_length = tag( "set.length" );

function primitive_set_length(){
  const set_cell = TOS;
  check_de&&mand_cell_type( set_cell, tag_reference );
  const _set = value_of( set_cell );
  const set_length = value_of( _set );
  clear( set_cell );
  set( TOS, type_integer, tag_set_length, set_length );
  set_tos_name( tag_set_length );
}
primitive( "set.length", primitive_set_length );


/*
 *  set.extend - extend a set with another set
 */

function primitive_set_extend(){
  const set_cell = TOS;
  check_de&&mand_cell_type( set_cell, tag_reference );
  const set = value_of( set_cell );
  const set_length = value_of( set );
  const set_capacity = to_cell( area_size( set ) );
  const other_set_cell = TOS - ONE;
  check_de&&mand_cell_type( other_set_cell, tag_reference );
  const other_set = value_of( other_set_cell );
  const other_set_length = value_of( other_set );
  // Add each element of the other set to the set
  let ii;
  for( ii = 0 ; ii < other_set_length ; ii++ ){
    const value_cell = other_set + ( ii + 1 ) * ONE;
    push();
    copy_cell( value_cell, TOS );
    primitive_set_put();
  }
  clear( set_cell );
  TOS -= 2 * ONE;
}
primitive( "set.extend", primitive_set_extend );


/*
  *  set.union - union of two sets
  */

function primitive_set_union(){
  const set_cell = TOS;
  check_de&&mand_cell_type( set_cell, tag_reference );
  const set = value_of( set_cell );
  const set_length = value_of( set );
  const set_capacity = to_cell( area_size( set ) );
  const other_set_cell = TOS - ONE;
  check_de&&mand_cell_type( other_set_cell, tag_reference );
  const other_set = value_of( other_set_cell );
  const other_set_length = value_of( other_set );
  // Add each element of the other set to the set
  let ii;
  for( ii = 0 ; ii < other_set_length ; ii++ ){
    const value_cell = other_set + ( ii + 1 ) * ONE;
    push();
    copy_cell( value_cell, TOS );
    primitive_set_put();
  }
  // Return the set
  clear( set_cell );
  TOS -= ONE;
}
primitive( "set.union", primitive_set_union );


/*
 *  set.intersection - intersection of two sets
 */

function primitive_set_intersection(){
  const set_cell = TOS;
  check_de&&mand_cell_type( set_cell, tag_reference );
  const set = value_of( set_cell );
  let   set_length = value_of( set );
  const set_capacity = to_cell( area_size( set ) );
  const other_set_cell = TOS - ONE;
  check_de&&mand_cell_type( other_set_cell, tag_reference );
  const other_set = value_of( other_set_cell );
  const other_set_length = value_of( other_set );
  // Remove each element of the set that is not in the other set
  let ii;
  for( ii = 0; ii < set_length; ii++ ){
    const value_cell = set + ( ii + 1 ) * ONE;
    push();
    copy_cell( value_cell, TOS );
    primitive_set_get();
    if( is_a_void_cell( TOS ) ){
      // The element is not in the other set, remove it
      move_cell( set + ( set_length ) * ONE, set + ( ii + 1 ) * ONE );
      set_value( set, set_length - 1 );
      ii--;
      set_length--;
    }
  }
  // Return the set
  clear( set_cell );
  TOS -= ONE;
}
primitive( "set.intersection", primitive_set_intersection );


/* ----------------------------------------------------------------------------
 *  Type box
 *  A box is a cell that references another cell. It's like a pointer but
 *  safer because the box manages the reference count of the cell it points to.
 *  As a result, the box is always valid, it always points to a valid cell.
 *  Note: the cell that a box references is dynamically allocated.
 */


function set_box( box_cell : Cell, value_cell : Cell ){
  const allocated_cell = allocate_area( tag_box, size_of_cell );
  move_cell( value_cell, allocated_cell );
  set( box_cell, type_reference, tag_box, allocated_cell );
}


function box_free( box_cell : Area ){
  const value_cell = value_of( box_cell );
  clear( value_cell );
  area_free( value_cell );
  clear( box_cell );
}


/*
 *  box - boxify the top of the data stack
 */

function primive_box(){
  const allocated_cell = allocate_area( tag_box, size_of_cell );
  const kept_name = name_of( TOS );
  move_cell( TOS, allocated_cell );
  set( TOS, type_reference, kept_name, allocated_cell );
}
primitive( "box", primive_box );


/*
 *  @ - unary operator to access a boxed value, work with bound ranges too
 */

const tag_at = tag( "@" );

function primitive_at(){
  const box_cell = TOS;
  check_de&&mand_cell_type( box_cell, type_reference );
  const value_cell = value_of( box_cell );
  if( value_cell == 0 ){
    // The box is empty, return a void cell
    reset( TOS );
  } else {
    // The box is not empty, is it a range?
    if( area_tag( value_cell ) == tag_range ){
      // The box is a range, return a bound range
      de&&mand( range_is_free( value_cell ) );
      move_cell( box_cell, the_tmp_cell );
      pop();
      check_de&&mand_cell_type( TOS, type_reference );
      range_set_binding( value_cell, value_of( TOS ) );
      reset( TOS );
      move_cell( the_tmp_cell, TOS );
    }else{
      // ToDo: should lock/unlock?
      clear( box_cell );
      copy_cell( value_cell, TOS );
    }
  }
}
operator_primitive( "@", primitive_at );


/*
 *  at - like @ unary operator but it is not an operator
 */

primitive( "at", primitive_at );


/*
 *  @! - binary operator to set a boxed value, works with bound ranges too
 */

const tag_at_bang = tag( "@!" );

function primitive_at_set(){
  const box_cell = TOS;
  check_de&&mand_cell_type( box_cell, tag_box );
  const value_cell = value_of( box_cell );
  if( value_cell == 0 ){
    // The box is empty, ignore
    raw_drop();
  } else {
    clear( value_cell );
    move_cell( TOS + ONE, value_cell );
    reset( TOS );
    TOS -= 2 * ONE;
  }
}
operator_primitive( "@!", primitive_at_set );

/*
 *  at! - like the @! binary operator but it is not an operator
 */

primitive( "at!", primitive_at_set );


function reference_textify( c : Cell ){
// Convert an object into a text object

  const object = value_of( c );

  switch( area_tag( object ) ){

    case tag_text:
      return;

    case tag_box:
      copy_cell( object, the_tmp_cell );
      cell_textify( the_tmp_cell );
      move_cell( the_tmp_cell, c );
      return;

    case tag_range:
      range_textify_into( object, c );
      return;

    default:
      if( area_length( object ) == 1 ){
        copy_cell( object, the_tmp_cell );
        cell_textify( the_tmp_cell );
        move_cell( the_tmp_cell, c );
        return;
      }
      // ToDo: invoke some Inox implemented method?
  }
}


function cell_textify( c : Cell ){

  switch( type_of( c ) & 0x7 ){

    case type_void:
      set_type( c, type_reference );
      set_value( c, the_empty_text_cell  );
      return;

    case type_boolean:
      if( value_of( c ) == 0 ){
        set_type( c, type_reference );
        set_value( c, the_empty_text_cell  );
      }else{
        set_text_cell( c, "1" );
      }
      return;

    case type_integer:
      set_text_cell( c, N( value_of( c ) ) );
      return;

    case type_float:
      set_text_cell( c, float_as_text( value_of( c ) ) );
      return;

    case type_tag:
      set_text_cell( c, tag_as_text( value_of( c ) ) );
      return;

    case type_verb:
      set_text_cell( c, tag_as_text( unpack_name( info_of( c ) ) ) );
      return;

    case type_primitive:
      set_text_cell( c, tag_as_text( unpack_name( info_of( c ) ) ) );
      return;

    case type_reference:
      reference_textify( c );
      return;

    default:
      FATAL( S() + "Invalid type for cell, " + N( type_of( c ) ) );
      return;
  }

}


function cell_as_text( c : Cell ) : Text {

  alloc_de&&mand( cell_looks_safe( c ) );

  const v = value_of( c );
  const i = info_of(  c );
  const t = unpack_type( i );
  let   class_tag;

  switch( t ){

    case type_void :
      return no_text;

    case type_boolean :
      if( v == 0 ){
        return no_text;
      }
      return "1";

    case type_integer :
      return N( v );

    case type_float :
      return float_as_text( v );

    case type_tag :
      return tag_as_text( v );

    case type_verb :
      return tag_as_text( unpack_name( i ) );

    case type_primitive :
      return tag_as_text( unpack_name( i ) );

    case type_reference :

      class_tag = area_tag( v );

      if( class_tag == tag_text ){
        //c/ return LeanString( v );
        /**/ return lean_str_as_native( v );
      }

      if( class_tag == tag_range ){

        const binding = range_get_binding( v );

        // If not bound, return the length of the range
        if( binding == 0 ){
          const length = range_length( v );
          return integer_as_text( length );
        }

        de&&mand( area_is_busy( binding ) );

        // If it is a text, return a portion of it
        const bound_reference_class = area_tag( binding );
        if( bound_reference_class == tag_text ){
          let len  = lean_str_length( binding );
          let typ  = range_get_type( v );
          // Adjust negative start index into positive one
          let low  = range_get_low(  v );
          if( low < 0 ){
            low = len + low;
          }
          if( typ == range_type_for ){
            len = range_get_high( v );
          }else{
            // Adjust negative end index into positive one
            let high = range_get_high( v );
            if( high < 0 ){
              high = len + high;
            }
            // Compute length with or without end index included
            if( typ == range_type_but ){
              len = high - low;
            }else{
              len = high - low + 1;
            }
          }
          /**/ return lean_str_as_native( lean_substr( binding, low, len ) );
          //c/ return LeanString( lean_substr( binding, low, len ) );
        }else{
          // Otherwise, return the text representation of the cell
          return cell_as_text( binding );
        }
      }
      // ToDo: reenter the interpreter to call an as-text method?
      return S() + "Reference(" + N( v ) + ")";

    default :
      FATAL( "Invalid type " + N( t ) + " at " + C( c ) );
      return "unexpected";

  }

}

/* ---------------------------------------------------------------------------
 *  Range related primitives
 */

/*
 *  range-to - create a range from a low to a high index, included
 */

function primitive_range_to(){
  const high = pop_integer();
  const low  = pop_integer();
  // 4 cells: type, low, high, binding
  const r = allocate_area( tag_range, 4 * size_of_cell );
  set( r          , type_integer, tag_range_type, range_type_to );
  set( r + 1 * ONE, type_integer, tag_range_low,  low  );
  set( r + 2 * ONE, type_integer, tag_range_high, high );
  set( r + 3 * ONE, type_integer, tag_range_binding, 0 );
  push_reference( r );
}
primitive( "range-to", primitive_range_to );


/*
 *  range-but - create a range from a low to a high index, excluded
 */

function primitive_range_but(){
  const high = pop_integer();
  const low  = pop_integer();
  // 4 cells: type, low, high, binding
  const r = allocate_area( tag_range, 4 * size_of_cell );
  set( r          , type_integer, tag_range_type, range_type_but );
  set( r + 1 * ONE, type_integer, tag_range_low,  low  );
  set( r + 2 * ONE, type_integer, tag_range_high, high );
  set( r + 3 * ONE, type_integer, tag_range_binding, 0 );
  push_reference( r );
}
primitive( "range-but", primitive_range_but );


/*
 *  range-for - create a range from a low index and a length
 */

function primitive_range_for(){
  const length = pop_integer();
  const low    = pop_integer();
  // 4 cells: type, low, high, binding
  const r = allocate_area( tag_range, 4 * size_of_cell );
  set( r          , type_integer, tag_range_type, range_type_for );
  set( r + 1 * ONE, type_integer, tag_range_low,  low  );
  set( r + 2 * ONE, type_integer, tag_range_high, length );
  set( r + 3 * ONE, type_integer, tag_range_binding, 0 );
  push_reference( r );
}
primitive( "range-for", primitive_range_for );


/*
 *  range.over - bind a range to some composite value
 */

function primitive_range_over(){
  const r = pop_reference();
  const composite = pop_reference();
  // ToDo: should return a new range
  check_de&&mand( range_is_free( r ) );
  range_set_binding( r, composite );
  push_reference( r );
}
primitive( "range.over", primitive_range_over );


/* ----------------------------------------------------------------------------
 *  Primitives to handle the control stack local variables
 */

/*
 *  forget-control - clear the control stack downto to specified local
 *  ToDo: rename, remove-local? drop-local? pop-local? something else?
 */

function primitive_forget_control(){
  const n = pop_tag();
  while( name_of( CSP ) != n ){
    drop_control();
    if( CSP < ACTOR_control_stack ){
      FATAL( "forget-control, missing " + tag_as_text( n ) );
      return;
    }
  }
  drop_control();
}
primitive( "forget-control", primitive_forget_control );


/*
 *  return-without-locals - like return but with some cleanup
 *  ToDo: find a better name
 */

function primitive_forget_locals(){
// Return after a clear down to the with local variable sentinel included
  while( ! is_with( CSP ) ){
    drop_control();
    if( CSP < ACTOR_control_stack ){
      FATAL( "forget-locals, /with is missing" );
      return;
    }
  }
  pop_ip();
}
primitive( "forget-locals", primitive_forget_locals );


/*
 *  with-locals - prepare the control stack to handle local variables
 */

const tag_forget_locals = tag( "forget-locals" );

// Cannot initialize here in C++, see init_globals()
let forget_locals_definition = 0;
// = definition_of( tag_forget_locals );


function primitive_with_locals(){
// Prepare for a run that may create local variables
  CSP += ONE;
  defer( tag_with, IP );
  defer( tag_forget_locals, forget_locals_definition );
}
primitive( "with-locals", primitive_with_locals );


/* ----------------------------------------------------------------------------
 *  Methods calls & other calls with the it local variable
 */

/*
 *  return-without-it - internal, run-with-it uses it
 */


const tag_run_with_it = tag( "run-with-it" );

function primitive_forget_it(){
// Return after a clear down to the 'it' local variable included
  while( name_of( CSP ) != tag_it ){
    if( stack_de || run_de || step_de ){
      bug( "forget-it, " + tag_as_text( name_of( CSP ) ) );
    }
    drop_control();
    if( check_de && CSP < ACTOR_control_stack ){
      FATAL( "forget-it, 'it' is missing" );
      return;
    }
  }
  drop_control();
  pop_ip();
}
primitive( "forget-it", primitive_forget_it );


/*
 *  with-it - prepare the control stack to handle the 'it' local variable
 */

const tag_with_it   = tag( "with-it" );
const tag_forget_it = tag( "forget-it" );

// See init_globals() where this definition is set
let forget_it_definition = 0;
// = definition_of( tag_forget_it );


function primitive_with_it(){
// Prepare for a call to a block that expects an 'it' local variable

  defer( tag_with_it, IP );

  CSP += ONE;
  move_cell( pop(), CSP );
  set_name( CSP, tag_it );

  // Schedule forget-it execution
  defer( tag_forget_it, forget_it_definition );

}
primitive( "with-it", primitive_with_it );


/*
 *  it - access to the it local variable
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
  copy_cell( ptr, push() );
}
primitive( "it", primitive_it );


/*
 *  it! - change the value of the it local variable
 */

function primitive_set_it(){
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
  // ToDo: optimize this, the name is already ok
  reset( ptr );
  move_cell( pop(), ptr );
  set_name( ptr, tag_it );
}
primitive( "it!", primitive_set_it );


/*
 *  update-method-cache - update the class/method/definition cache
 */

function primitive_update_method_cache(){
  const definition = pop_integer();
  const method     = pop_tag();
  const classname  = pop_tag();
  update_method_cache( classname, method, definition );
}
primitive( "update-method-cache", primitive_update_method_cache );


/*
 *  clear-method-cache - clear the class/method/definition cache
 */

function primitive_clear_method_cache(){
  const method = pop_tag();
  const classname = pop_tag();
  clear_method_cache( classname, method );
}
primitive( "clear-method-cache", primitive_clear_method_cache );


/*
 *  run-super-method - run a method from a super class
 */

const tag_run_super_method = tag( "run-super-method" );

// See init_globals() where this definition is initialized
let run_super_method_definition = 0;
// = definition_of( tag_run_super_method );

function primitive_run_super_method(){
  const top = TOS;
  if( type_of( top ) != type_integer ){
    FATAL( "run-super-method, not an integer" );
    return;
  }
  const definition = eat_integer( top );
  pop();
  const method    = pop_tag();
  const classname = pop_tag();
  const target    = pop();
  run_class_method_on_target( classname, target, method );
}
primitive( "run-super-method", primitive_run_super_method );


// See init_globals() where the definition is initialized
let run_definition = 0;
// = definition_of( tag_run );

function run_class_method_on_target( target_class : Tag, target : Cell, name : Tag ){
// Run a method on an target value or object

  // First try with own class
  const own_method_def = find_method_definition( target_class, name );
  if( own_method_def != 0 ){
    call( name, own_method_def );
    return;
  }

  // Delegate to the class of the target
  push_tag( target_class );
  push_tag( name );
  defer( tag_run_super_method, run_super_method_definition );
  call_verb( target_class );

}


function run_target_method( target : Cell, name : Tag ){
// Run a method on an target value or object
  // Determine the class of the target value or object
  const target_type = type_of( target );
  const target_class
  = target_type == type_reference
  ? area_tag( value_of( target ) )
  : tag_of_type( target_type );
  // Run the method for that class on the target entity
  run_class_method_on_target( target_class, target, name );
}


function run_method( name : Tag ){
  run_target_method( TOS, name );
}


/*
 *  run-method-by-name - using a text to identify the method
 */

const tag_interpret = tag( "interpret" );

function primitive_run_method_by_name(){
// Call method by name
  const auto_ = pop_as_text();
  // There must already exist a tag with that name
  if( ! tag_exists( auto_ ) ){
    // If not, use tag /interpret
    push_text( auto_ );
    run_method( tag_interpret );
  }else{
    // Use existing tag
    // ToDo: should do that only if tag is in the method cache?
    run_method( tag( auto_ ) );
  }
}
primitive( "run-method-by-name", primitive_run_method_by_name );


/*
 *  run-method - using a tag to identify the method
 */

function primitive_run_method(){
  run_method( pop_tag() );
}
primitive( "run-method", primitive_run_method );


/*
 *  class-method-tag - get the tag of a method for a class
 */

function primitive_class_method_tag(){
  const class_tag  = pop_tag();
  const method_tag = pop_tag();
  const auto_class_name  = tag_as_text( class_tag );
  const auto_method_name = tag_as_text( method_tag );
  const class_method_tag = tag( auto_class_name + "." + auto_method_name );
  push_tag( class_method_tag );
}
primitive( "class-method-tag", primitive_class_method_tag );


/*
 *  run-with-it - like run but with an "it" local variable
 */

function make_local_it( cell : Cell ){
  CSP += ONE;
  move_cell( cell, CSP );
  set_name( CSP, tag_it );
  // Schedule forget-it execution
  defer( tag_forget_it, forget_it_definition );
}


function primitive_run_with_it(){
  const block = pop_block();
  // Push normal return address onto control stack
  call( tag_run_with_it, block );
  make_local_it( pop() );
}
primitive( "run-with-it", primitive_run_with_it );


/* ---------------------------------------------------------------------------
 *  low level unsafe access to CSP, TOS & IP registers
 */

/*
 *  words_per_cell - plaftorm dependent, current 1
 */

const tag_words_per_cell = tag( "words-per-cell" );

function primitive_words_per_cell(){
  set( push(), type_integer, tag_words_per_cell, ONE );
}
primitive( "words-per-cell", primitive_words_per_cell );


/*
 *  CSP - Constrol Stack Pointer, address of the top of the control stack
 */


const tag_CSP = tag( "CSP" );

function primitive_CSP(){
  set( push(), type_integer, tag_CSP, CSP );
}
primitive( "CSP", primitive_CSP );


/*
 *  set-CSP - move the top of the control stack
 */

function primitive_set_CSP(){
  CSP = pop_integer();
}
primitive( "CSP!", primitive_set_CSP );


/*
 *  TOS - address of the top of the data stack
 */

const tag_TOS = tag( "TOS" );

function primitive_TOS(){
  push();
  set( TOS, type_integer, tag_TOS, TOS );
};
primitive( "TOS", primitive_TOS );


/*
 *  set-TOS - move the top of the data stack to some new address
 */

function primitive_set_TOS(){
  TOS = pop_integer();
};
primitive( "TOS!", primitive_set_TOS );


/*
 *  IP - access to the instruction pointer where the primitive was called
 *  This enables self modifying code, tricky but possible.
 */

const tag_IP = tag( "IP" );

function primitive_IP(){
  set( push(), type_integer, tag_IP, IP );
}
primitive( "IP", primitive_IP );


/*
 *  set-IP - jump to some address
 */

function primitive_set_IP(){
  IP = pop_integer();
}
primitive( "IP!", primitive_set_IP );


/* ---------------------------------------------------------------------------
 *  Forth words
 */


/*
 *  ALLOT - allocate some memory by moving the HERE pointer forward
 */

function primitive_ALLOT(){
  const n = pop_integer();
  the_next_free_cell += n;
  // ToDo: check for overflow?
}
primitive( "ALLOT", primitive_ALLOT );


/*
 *  HERE - the current value of the HERE pointer
 */

const tag_HERE = tag( "HERE" );

function primitive_HERE(){
  set( push(), type_integer, tag_HERE, the_next_free_cell );
}


/*
 *  ALIGN - See Forth 2012, noop in Inox
 */

function primitive_ALIGN(){
}
primitive( "ALIGN", primitive_ALIGN );


/*
 *  ALIGNED - See Forth 2012, noop in Inox
 */

function primitive_ALIGNED(){
}
primitive( "ALIGNED", primitive_ALIGNED );


/*
 *  CHAR+ - Forth, increment a character address
 */

const tag_CHAR_plus = tag( "CHAR+" );

function primitive_CHAR_plus(){
  const c = pop_integer();
  set( push(), type_integer, tag_CHAR_plus, c + ONE );
}


/*
 *  STATE - Forth 2012, the current state of the interpreter
 */

const tag_STATE = tag( "STATE" );

function primitive_STATE(){
  set( push(), type_integer, tag_STATE, eval_is_compiling() ? 1 : 0 );
}
primitive( "STATE", primitive_STATE );


/* -----------------------------------------------------------------------
 *  runner, fast, execute Inox verbs
 */

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
  run:     Function;  // Points to run()
}

const TheInoxExecutionContext = new InoxExecutionContext();


function init_the_execution_context(){
  const inox = TheInoxExecutionContext;
  inox.ip      = get_IP;
  inox.csp     = get_CSP;
  inox.tos     = get_TOS;
  inox.set_ip  = set_IP;
  inox.set_csp = set_CSP;
  inox.set_tos = set_TOS;
  inox.push    = push;
  inox.pop     = pop;
  inox.run     = run;
}

init_the_execution_context();

/*}*/


/**/ function SET_IP(  v ){ IP  = v; }
//c/ #define  SET_IP( v )  IP  = v
/**/ function SET_CSP( v ){ CSP = v; }
//c/ #define  SET_CSP( v ) CSP = v
/**/ function SET_TOS( v ){ TOS = v; }
//c/ #define  SET_TOS( v ) TOS = v


function push() : Cell {
  de&&mand( TOS < ACTOR_data_stack_limit );
  return TOS += ONE;
}


function pop() : Cell {
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


/**/ de&&mand_eq( type_primitive, 6 );

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
  inox.push    = push;
  inox.pop     = pop;
  inox.run     = run;
}



init_inox_execution_context();

/*}*/


/* --------------------------------------------------------------------------
 *  code runner, fast, execute Inox verb definitions
 *
 *  This is the one function that needs to run fast.
 *  It should be optimized by hand depending on the target CPU.
 *  See https://muforth.nimblemachines.com/threaded-code/
 *  Also http://www.ultratechnology.com/1xforth.htm
 *  and http://www.bradrodriguez.com/papers/moving1.htm
 *
 *  The current solution is to encode the definition using cells. Then,
 *  starting from a first cell, pointed using the global IP register, the
 *  cell's content is examined to determine what to do.
 *
 *  If the cell's type is void, then the cell's value is the id of a
 *  primitive function to call. The primitive function is called with
 *  no arguments. It can consume or produce results either on the data
 *  stack or on the control stack, or both. It may also modify the IP,
 *  CSP, or TOS registers the way it wants.
 *
 *  If the cell's type is a verb, then the cell's value is the address of the
 *  next cell to execute. Before changing IP using this address, the current
 *  IP is pushed on the control stack.
 *
 *  Otherwise, the cell's type is a data cell. The cell's value is pushed
 *  on the data stack.
 *
 *  The code runner is a loop that executes the code pointed by IP until it
 *  reaches a void cell. This is interpreted as the end of the current verb.
 *  Control is then returned to the caller, which is the previous IP on the
 *  control stack.
 *
 *  The loop also checks a global variable that is decremented at each
 *  iteration. It is a credit counter that is initialized to a large value.
 *  When it reaches zero, the global scheduler is called to give a chance
 *  to other actors to run. ToDo: implement this.
 *
 *  The current encoding for verb definitions is not space efficient. It uses
 *  one cell per instruction. When addresses are 32 bits, this means that
 *  each cell is 8 bytes. This is not a problem for now, but it will be
 *  when the code will run on memory constrained devices like IoT devices.
 *
 *  One possible optimization is to use a variable length encoding.
 */

function run(){

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
      #define RUN_FAST_FAST
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
        ! de
        //c/ || INOX_FAST_RUN
      ){

        if(
          /*c{
            #ifdef RUN_FAST_FAST
              ! fast_ip
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
              + inox_machine_code_cell_as_text( IP )
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
            t = w64 >> 61;
          #else
            #error "Not implemented"
          #endif
          #ifdef RUN_DEBUG
            mand_eq( t, debug_type );
          #endif

          // Primitives
          if( t == type_primitive ){

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
                mand( t == type_reference );
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
                mand_neq(
                  name_of( value_of( TOS ) - 2 * ONE ),
                  tag_dynamic_next_area
                );
              #endif

            }else{
              #ifdef RUN_DEBUG
                mand( ! is_sharable( IP ) );
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
            get_primitive( name_of( i ) )();
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
        /**/ if( ! IP )break loop;
        //c/ if( ! IP )goto break_loop;

        i = info_of( IP );

        // What type of code this is, primitive, Inox verb or literal
        t = unpack_type( i );
        // Trace execution when needed
        if( verbose_stack_de || run_de ){
          if( t != type_primitive
          || ( i != 0x0000 && unpack_name( i ) != tag_debug_info )
          ){
            if( verbose_stack_de ){
              bug( S()
                + "\nRUN IP: "
                + inox_machine_code_cell_as_text( IP )
                + stacks_dump()
              );
            }else if( run_de ){
              bug( S()
                + "\nRUN IP: "
                + inox_machine_code_cell_as_text( IP )
              );
            }
          }
        }

  if( step_de && unpack_name( i ) != tag_debug_info )debugger;

        // Special "next" code, 0x0000, is a jump to the return address
        if( i == 0x0000 ){
          if( check_de ){
            if( type_of( CSP ) == type_ip ){
              if( run_de ){
                bug( S()
                  + "run, return to " + C( IP )
                  + " of " + tag_as_text( name_of( CSP ) )
                );
              }
            }else{
              FATAL( "Invalid return, not a verb" );
              IP = 0;
              return;
            }
          }
          // ToDo: check underflow?
          pop_ip();
          continue;
        }

        // Call to another verb, the name of the cell names it
        if( t == type_verb ){
          // Either a call or a jump, jump if next IP points to a return
          if( info_of( IP + ONE ) != 0x0000 ){
            // Push return address into control stack, named to help debugging
            defer( unpack_name( i ), IP + ONE );
          }
          // ToDo: set type to Act?
          IP = value_of( IP );
          // bug( text_of_verb_definition( unpack_name( verb ) ) );
          continue;
        }

        // Call to a primitive, the name of the cell names it
        if( t == type_primitive ){

          IP += ONE;

          // Some debug tool to detect bad control stack or IP manipulations
          let verb_id = unpack_name( i );
          if( run_de && verb_id != 61 ){  // quote is special

            let old_csp = CSP;
            let old_ip  = IP;

            if( get_primitive( verb_id ) == no_operation ){
              FATAL(
                "Run. Primitive function not found for id " + N( i )
                + ", name " + tag_as_dump_text( verb_id )
              );
            }else{
              fun = get_primitive( verb_id );
              fun();
            }

            if( CSP != old_csp
            && verb_id != tag( "return" )
            && verb_id != tag( "return-if" )
            && verb_id != tag( "return-unless" )
            && verb_id != tag( "run" )
            && verb_id != tag( "if" )
            && verb_id != tag( "if-else" )
            && verb_id != tag( "if-not" )
            && verb_id != tag( "text.run" )
            && verb_id != tag( "tag.run" )
            && verb_id != tag( "block.run" )
            && verb_id != tag( "verb.run" )
            && verb_id != tag( "integer.run" )
            && verb_id != tag( "run-method-by-name" )
            && verb_id != tag( "run-method" )
            && verb_id != tag( "while-1" )
            && verb_id != tag( "while-2" )
            && verb_id != tag( "while-3" )
            && verb_id != tag( "until-3" )
            && verb_id != tag( "loop" )
            && verb_id != tag( "break" )
            && verb_id != tag( "break-if" )
            && verb_id != tag( "with-it" )
            && verb_id != tag( "forget-it" )
            && verb_id != tag( "from-local" )
            && verb_id != tag( "make.local" )
            && verb_id != tag( "forget-control" )
            && verb_id != tag( "sentinel" )
            && verb_id != tag( "jump" )
            && verb_id != tag( "run-with-parameters" )
            && verb_id != tag( "forget-parameters" )
            && verb_id != tag( "run-with-it" )
            && verb_id != tag( "forget-it" )
            && verb_id != tag( "clear-control" )
            && verb_id != tag( "clear-data" )
            && verb_id != tag( "assert" )
            && verb_id != tag( "assert-checker" )
            && verb_id != tag( ">control" )
            && verb_id != tag( "control>" )
            && verb_id != tag( "on-return" )
            && verb_id != tag( "destructor" )
            && verb_id != tag( "inlined-block-jump" )
            && verb_id != tag( "scope" )
            && verb_id != tag( "scope-close" )
            && verb_id != tag( "parameters" )
            ){
              if( CSP < old_csp ){
                bug( S()
                  + "??? small CSP, excess calls, "
                  + N( ( old_csp - CSP ) / ONE )
                );
              }else{
                bug( S()
                  + "??? big CSP, excess returns "
                  + N( ( CSP - old_csp ) / ONE )
                );
              }
              de&&bug( S()
                + "Due to " + F( fun )
                + ", " + inox_machine_code_cell_as_text( old_ip )
              );
              debugger;
              // CSP = old_csp;
            }
            if( IP && IP != old_ip ){
              bug( S()
                + "run, IP change, was " + C( old_ip - ONE )
                + ", due to "
                + inox_machine_code_cell_as_text( old_ip - ONE )
              );
            }
            if( IP == 0 ){
              bug( S()+ "run, IP 0 due to " + F( fun ) );
              // break loop;  // That's not supposed to be a way to exit the loop
            }

          }else{
            fun = get_primitive( verb_id );
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
  defer( tag_eval, 0 );

  // ToDo: better checks for stacks overflow and underflow
  stack_de&&mand_stacks_are_in_bounds();

  run();

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
 *
 *  ToDo: define a special character sequence for the tokenizer to switch to
 *  another dialect. For example, using * as a substitute for the current
 *  dialect's name.
 *
 *  to *clean xxx *yyy *zzz; style code would expand into something like
 *  to dialect-clean xxx dialect-yyy dialect-zzz; style code, where dialect
 *  is the name of the current dialect. There should also be a way to
 *  use a fully qualified name, like \clean, to force the use of the
 *  global symbol table.
 *
 *  See https://en.wikipedia.org/wiki/Namespace
 */

// Name of current style, "inox" or "forth" typically
/**/ let  the_style = "";
//c/ static Text the_style( "" );


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
  if( ! stack_contains_tag( all_aliases_by_style, style_tag ) ){
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
  if( ! stack_contains_tag( aliases, alias_tag ) ){
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
  if( ! stack_contains_name( the_current_style_aliases, a ) )return no_text;
  return cell_as_text( stack_lookup_by_name( the_current_style_aliases, a ) );
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
primitive( "dialect!", primitive_set_dialect );


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
    let auto_alias = tag_as_text( name_of( alias_cell ) );
    let auto_alias_text = cell_as_text( alias_cell );
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

/*
 *  {| - enter immediate mode
 */

function primitive_enter_immediate_mode(){
  immediate_mode_level++;
}
immediate_primitive( "{|", primitive_enter_immediate_mode );


/*
 *  |} - leave immediate mode
 */

function primitive_leave_immediate_mode(){
  de&&mand( !! immediate_mode_level );
  immediate_mode_level--;
}
immediate_primitive( "|}", primitive_leave_immediate_mode );


/*
 *  literal - add a literal to the Inox verb beeing defined,
 *  or to a block.
 */


function primitive_literal(){
  const save_immediate_mode_level = immediate_mode_level;
  immediate_mode_level = 0;
  eval_do_literal();
  immediate_mode_level = save_immediate_mode_level;
}
primitive( "literal", primitive_literal );


/*
 *  compile-verb - add a verb to the verb beeing defined,
 *  or to a block.
 */

function primitive_compile_verb(){
  eval_do_machine_code( pop_verb() );
}
primitive( "compile-verb", primitive_compile_verb );


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
  // Skip debug info
  if( verb_id == tag_debug_info ){
    IP += ONE;
    verb_id = name_of( IP );
  }
  the_last_quoted_verb_id = verb_id;
  push();
  raw_copy_cell( IP, TOS );
  // Skip the quoted instruction
  IP += ONE;
}
primitive( "quote", primitive_quote );


/* -----------------------------------------------------------------------------
 *  Primitives to change the flags attached to a verb.
 */

/*
 *  last-verb - get the name of the last defined verb
 */

function primitive_last_verb(){
  push_verb( the_last_defined_verb );
}
primitive( "last-verb", primitive_last_verb );


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
 *  Operators are verbs that are compiled in a special way that differs from
 *  the normal postfix ways. They are used to implement infix operators.
 */

function primitive_operator(){
  set_verb_operator_flag( the_last_defined_verb );
}
primitive( "operator", primitive_operator );


/*
 *  inline - make the last defined verb inline
 *  Inlined verbs are verbs whose definition is copied instead of beeing
 *  referenced. This is a way to optimize the execution of a verb by
 *  avoiding some control stack operations. It is also a way to implement
 *  some tricky verbs that would be difficult to implement otherwise.
 */

function primitive_inline(){
  set_inline_verb_flag( the_last_defined_verb );
}
primitive( "inline", primitive_inline );


/*
 *  last-token - return the last tokenized item
 *  last-token-info - return the last tokenized item info, including it's
 *  position in the source code, line and column, etc.
 */

function primitive_last_token(){
  copy_cell( the_last_token_cell, push() );
}
primitive( "last-token", primitive_last_token );


/*
 *  as-void - cast a value into a void type of value
 */

function primitive_as_void(){
  const top = TOS;
  if( is_sharable( top ) ){
    area_free( value_of( top ) );
  }
  set_type( top, type_void );
}
primitive( "as-void", primitive_as_void );


/*
 *  as-verb - make a verb, from a value text representation, or void
 */

const tag_as_verb = tag( "as-verb" );

function primitive_as_verb(){
  const auto_ = cell_as_text( TOS );
  const is_it = verb_exists( auto_ );
  clear( TOS );
  if( is_it ){
    set_verb_cell( TOS,tag( auto_ ) );
  }
}
primitive( "as-verb", primitive_as_verb );


/*
 *  text.as-verb - make a verb, from a text representation, or noop
 */

function primitive_text_as_verb(){
  const auto_ = cell_as_text( TOS );
  clear( TOS );
  if( verb_exists( auto_ ) ){
    set_verb_cell( TOS, tag( auto_ )) ;
  }else{
    set_verb_cell( TOS, tag( "noop" ) );
  }
}
primitive( "text.as-verb", primitive_text_as_verb );


/*
 *  as-tag - make a tag, from a value text representation
 */

function primitive_as_tag(){
  const t = tag( cell_as_text( TOS ) );
  clear( TOS );
  set( TOS, type_tag, tag_tag, t );
}
primitive( "as-tag", primitive_as_tag );


/*
 *  tag.run - run a verb by tag, noop if verb is not defined
 */

function call_verb( verb_id : Index ){
  call( verb_id, definition_of( verb_id ) );
}


function primitive_tag_run(){
  call_verb( pop_tag() );
}
primitive( "tag.run", primitive_tag_run );


/*
 *  text.run - run a verb by text name
 */

function primitive_text_run(){
  const top = TOS;
  const auto_ = cell_as_text( top );
  drop();
  // ToDo: better error handling
  // Should call missing-verb?
  de&&mand( tag_exists( auto_ ) );
  let verb_id = tag( auto_ );
  call_verb( verb_id );
}
primitive( "text.run", primitive_text_run );


/*
 *  verb.run - run a verb
 */

function primitive_verb_run(){
  de&&mand_cell_type( TOS, type_verb );
  const definition = value_of( TOS );
  // If definition is known, jump to it
  if( definition ){
    call( name_of( TOS ), definition );
    return;
  }
  // Else, use current definition
  // ToDo: local cache of definition, unless verb is "late binding" flagged
  const verb_id = name_of( TOS );
  call_verb( verb_id );
}
primitive( "verb.run", primitive_verb_run );


/*
 *  definition - get the definition of a verb, default is noop
 *  It returns the address of the first compiled code of the verb.
 *  There is a header in the previous cell, with length and flags.
 *  ToDo: should return a block instead of an address?
 */

const tag_definition = tag( "definition" );

function primitive_definition(){
  const auto_ = cell_as_text( TOS );
  clear( TOS );
  let verb_id;
  if( tag_exists( auto_ ) ){
    verb_id = tag( auto_ );
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
 *  definitions - get the list of all the definitions
 */

const tag_definitions = tag( "definitions" );

function primitive_definitions(){
  let ndef = 0;
  // Count the number of definitions
  let ii = 0;
  while( ii < all_symbol_cells_length ){
    if( all_symbol_cells[ ii ] ){
      if( all_definitions[ ii ] ){
        ndef++;
      }
    }
  }
  // Allocate a stack object to hold all the definitions
  const list = stack_allocate( ndef );
  // Fill the list with the definitions
  ii = 0;
  while( ii < all_symbol_cells_length ){
    if( all_symbol_cells[ ii ] ){
      if( all_definitions[ ii ] ){
        set(
          the_tmp_cell,
          type_integer,
          all_symbol_cells[ ii ],
          all_definitions[ ii ]
        );
        stack_push( list, the_tmp_cell );
      }
    }
  }
  // Return the list
  push();
  set( TOS, type_reference, tag_definitions, list );
}
primitive( "definitions", primitive_definitions );


/*
 *   integer.run - run a block or a verb definition
 */

const tag_run = tag( "run" );

function primitive_integer_run(){
  call( tag_run, pop_integer() );
}
primitive( "integer.run", primitive_integer_run );


/*
 *  block.run - run a block object
 */

const tag_block_run = tag( "block-run" );

function primitive_block_run(){
  const block = pop_reference();
  call( tag_block_run, block );
}
primitive( "block.run", primitive_block_run );


/*
 *  destructor - internal, clear a reference and return from current verb
 *  Reminder: the top of the control stack is always a return address
 *  ToDo: inline for speed
 */

const tag_destructor = tag( "destructor" );

// See init_globals() where the definition is initialized
let destructor_definition = 0;
// = definition_of( tag_destructor );

function primitive_destructor(){
  // Pop then value to clear and clear it, then pop the return address
  drop_control();
  pop_ip();
}
primitive( "destructor", primitive_destructor );


/*
 *  scope - create a new scope
 */

const tag_scope_open  = tag( "scope-open"  );
const tag_scope_close = tag( "scope-close" );

// See init_globals() where the definition is initialized
let scope_close_definition = 0;
// = definition_of( tag_scope_close );

function primitive_scope(){
  // Install sentinel
  CSP += ONE;
  set( CSP, type_tag, tag_scope_open, 0 );
  // Schedule scope close cleaner
  defer( tag_scope_close, scope_close_definition );
}
primitive( "scope", primitive_scope );


function primitive_scope_close(){
  // Clear all values in control stack, down to scope open sentinel
  while( true ){
    const info = info_of( CSP );
    if( unpack_name( info ) === tag_scope_open ){
      break;
    }
    // Check limit
    if( check_de && CSP <= ACTOR_control_stack ){
      FATAL( "Missing scope open sentinel" );
      return
    }
    drop_control();
  }
  // Pop the scope-open sentinel and then the return address
  check_de&&mand_cell_name( CSP, tag_scope_open );
  check_de&&mand_cell_type( CSP, type_tag );
  raw_drop_control();
  pop_ip();
}
primitive( "scope-close", primitive_scope_close );


/*
 *  run - depending on type, run a definition, a primitive or do nothing
 */

function primitive_run(){

  let info = info_of( TOS );
  let id;

  switch( unpack_type( info ) ){

    // Running a void leads to it's literal value
    case type_void:
      break;

    // Running a boolean leads to it's literal value
    case type_boolean:
      break;

    // Run an integer, assuming it is a definition
    // ToDo: don't do that, run verbs only?
    case type_integer:
      call( tag_run, pop_raw_value() );
      break;

    // Running a float leads to it's literal value
    case type_float:
      break;

    // Run a tag, assuming it is a verb name
    case type_tag:
      // ToDo: use value?
      id = unpack_name( info );
      reset( pop() );
      call_verb( id );
      break;

    // Run a verb
    case type_verb:
      // If definition is known, run it directly
      id = value_of( TOS );
      if( id != 0 ){
        call( name_of( TOS ), id );
        reset( pop() );
        break;
      }
      // If no defintion, run the one associated to the verb
      id = unpack_name( info );
      reset( pop() );
      call_verb( id );
      break;

    // Run a primitive
    case type_primitive :
      reset( pop() );
      get_primitive( unpack_name( info ) );
      break;

    // Run a reference, assuming it is a block
    case type_reference:
      // Value is IP of block
      id = value_of( TOS );
      // Push reference to clear later on
      CSP += ONE;
      move_cell( TOS, CSP );
      pop();
      // Schedule call to destructor, it will clear the reference and return
      defer( tag_destructor, destructor_definition );
      // Schedule call to block
      call( tag_run, id );
      break;

    default:
      break;
  }
}
primitive( "run", primitive_run );


/*
 *  block.return - jump to a block and then return from current verb
 */

const tag_block_return = tag( "block-jump" );

function primitive_block_return(){
  const top = TOS;
  pop();
  check_de&&mand_cell_type( TOS, type_reference );
  const ip = value_of( TOS );
  // Push reference to clear later on
  CSP += ONE;
  move_cell( TOS, CSP );
  // Schedule call to destructor, it will clear the reference and return
  defer( tag_destructor, destructor_definition );
  // Jump to block
  IP = ip;
}
primitive( "block.return", primitive_block_return );


/*
 *  partial - attach values to a runnable value to make a new block
 *  ToDo: verb.partial, primitive.partial, tag.partial and integer.partial
 *  to speed up partial application when runnable value's type is known
 */

function primitive_partial(){

  // Number of values to attach to the block
  const nvalues = pop_integer();

  check_de&&mand( nvalues >= 0 );

  // Allocate a block with space for the values, the runnable + run + return
  const block_area = allocate_area( tag_block, ( nvalues + 3 ) * size_of_cell );

  // Push the values and the block into the new block object
  let ii = 0;
  while( ii <= nvalues ){
    move_cell( pop(), block_area + ii * ONE );
    ii += 1;
  }

  // Add a call to primitive run
  set( block_area + ii * ONE, type_primitive, tag_run, 0 );

  // Push the resulting block object
  set( push(), type_reference, tag_block, block_area );

}
primitive( "partial", primitive_partial );


/*
 *  block.partial - attach values to a block, making a new block
 */

function primitive_block_partial(){

  // Target block
  let top = pop();

  // Number of value to attach to the block
  const nvalues = pop_integer();

  // Allocate a block object with for the values + block + run + return
  const block_area = allocate_area( tag_block, ( nvalues + 3 ) * size_of_cell );

  // Push the values into the block object
  let ii;
  for( ii = 0 ; ii < nvalues; ii++ ){
    move_cell( pop(), block_area + ii * ONE );
  }

  // Move the block into the new block object
  move_cell( top, block_area + ii * ONE );
  ii += 1;

  // Add a primitive run to the new block
  set( block_area + ii * ONE, type_primitive, tag_run, 0 );

  // Push the resulting block object
  set( push(), type_reference, tag_block, block_area );

}
primitive( "block.partial", primitive_block_partial );


/*
 *  attach - attach a single value to a block, a target object typically
 */


const tag_attach = tag( "attach" );

function primitive_attach(){

  // Target block
  let top = pop();

  // Allocate a block object with space for the value + block + run + return
  const block_area = allocate_area( tag_block, 4 * size_of_cell );

  // Push the value into the block object
  move_cell( TOS, block_area );

  // Move the block into the new block object
  move_cell( top, block_area + ONE );

  // Add a primitive run to the target runnable
  // ToDo: optimize with a run&return primitive, aka jump
  set( block_area + 2 * ONE, type_primitive, tag_run, 0 );

  // Push the resulting block object
  set( TOS, type_reference, tag_attach, block_area );

}
primitive( "attach", primitive_attach );


/*
 *  as-block - convert a runnable value into a block
 */

function primitive_as_block(){

  // Get the runnable value
  const runnable = pop();
  const type = type_of( runnable );

  // Done if already a good loking dynamic block
  if( type_of( runnable ) == type_reference
  &&  area_tag( value_of( runnable ) ) == tag_block
  ){
    push();
    return;
  }
  // If this is a verb or a primitive, make a block with a call to it
  if( type == type_verb || type == type_primitive ){
    // Allocate a block object with enough space for the value + return
    const short_block_area = allocate_area( tag_block, 2 * size_of_cell );
    // Push the value into the block object
    move_cell( runnable, short_block_area );
    // Push the resulting block object
    set( push(), type_reference, tag_block, short_block_area );
    return;
  }

  // Allocate a block object with enough space for the value + run + return
  // ToDo: avoid the return using a special jump primitive
  const block_area = allocate_area( tag_block, 3 * size_of_cell );
  // Push the value into the block object
  move_cell( runnable, block_area );
  // Add a run to the target block
  // ToDo: should select what primitive to call depending on runnable's type
  if( type == type_reference ){
    set( block_area + ONE, type_primitive, tag_block_return, 0 );
  }else{
    set( block_area + ONE, type_primitive, tag_run, 0 );
  }
  // Push the resulting block object
  set( push(), type_reference, tag_block, block_area );

}
primitive( "as-block", primitive_as_block );


/*
 *  block.join - join two blocks into a new block
 */

function primitive_block_join(){
  // Get the two blocks
  const block2 = pop();
  const block1 = pop();
  // Allocate a block object with enough space for the two blocks + run + return
  const block_area = allocate_area( tag_block, 5 * size_of_cell );
  // Push the two blocks + run into the block object
  move_cell( block1, block_area );
  set( block_area + ONE, type_primitive, tag_run, 0 );
  move_cell( block2, block_area + 2 * ONE );
  set( block_area + 3 * ONE, type_primitive, tag_run, 0 );
  // Push the resulting block object
  set( push(), type_reference, tag_block, block_area );
}
primitive( "block.join", primitive_block_join );


/*
 *  make.it - initialize a new "it" local variable
 */

function primitive_make_it(){
  const it = pop();
  const new_csp = CSP + ONE;
  move_cell( CSP, new_csp );
  move_cell( it, CSP );
  CSP = new_csp;
}
primitive( "make.it", primitive_make_it );


/*
 *  jump-it - run a definition with a preset "it" local variable
 */

const tag_inlined_jump_it = tag( "inlined-jump-it" );

function primitive_inlined_jump_it(){
  primitive_make_it();
  IP = value_of( IP );
}
primitive( "inlined-jump-it", primitive_inlined_jump_it );


/*
 *  drop-control - drop the top of the control stack
 */

const tag_drop_control = tag( "drop-control" );

function primitive_drop_control(){
  drop_control();
}
primitive( "drop-control", primitive_drop_control );


/*
 *  block.run-it - run a block with a preset "it" local variable
 */

const tag_block_run_it = tag( "block-run-it" );

function primitive_block_run_it(){
  primitive_make_it();
  defer( tag_drop_control, value_of( IP ) );
}


/*
 *  bind-to - make a block object with an "it" preset local variable
 */

function primitive_bind_to(){
  const it = pop();
  // Allocate a block object with enough space for two instructions
  const block_area = allocate_area( tag_block, 2 * size_of_cell );
  // The first instruction will push the value of the "it" local variable
  move_cell( it, block_area );
  // The second one creates the local variable and jump to the definition
  if( type_of( TOS ) == type_reference ){
    set(
      block_area + ONE,
      type_primitive,
      tag_inlined_jump_it, value_of( TOS )
    );
  }else{
    set( block_area + ONE, type_primitive, tag_block_run_it, value_of( TOS ) );
  }
  // Push the block object
  set( TOS, type_reference, tag_block, block_area );
}
primitive( "bind-to", primitive_bind_to );


/*
 *  run-definition - run a verb definition
 */

function primitive_run_definition(){
  // "inox Hello run-definition" does what Hello does alone
  const verb_id = pop_integer();
  // ToDo: check that it is a valid verb id
  call_verb( verb_id );
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
  // The block header is at IP, it is an integer
  check_de&&mand_integer( IP );
  // It's name is /block-header
  check_de&&mand_cell_name( IP, tag_block_header );
  let length = block_length( IP );
  // Push the address, skipping the block header
  push();
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
    //  bug( S()+ "Bad opcode, not void, " + tag_as_text( previous_cell_name))
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

const token_base               = 0;
const token_type_word          = 1;
const token_type_number        = 2;
const token_type_text          = 3;
const token_type_comment       = 4;
const token_comment_multiline  = 5;
const token_type_eof           = 6;
const token_type_indentation   = 7;
const token_type_error         = 8;


function token_type_as_text( type : Index ) : Text {
  switch( type ){
    case token_base:               return "token_base";
    case token_type_word:          return "token_word";
    case token_type_number:        return "token_number";
    case token_type_text:          return "token_text";
    case token_type_comment:       return "token_comment";
    case token_comment_multiline:  return "token_comment_multiline";
    case token_type_eof:           return "token_eof";
    case token_type_indentation:   return "token_indent";
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


function tag_for_token_type( type : Index ) : Tag {
  switch( type ){
    case token_base:               return tag_token_base;
    case token_type_word:          return tag_token_word;
    case token_type_number:        return tag_token_number;
    case token_type_text:          return tag_token_text;
    case token_type_comment:       return tag_token_comment;
    case token_comment_multiline:  return tag_token_comment_multiline;
    case token_type_eof:           return tag_token_eof;
    case token_type_indentation:   return tag_token_indent;
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
  if( t == tag_token_indent )             return token_type_indentation;
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
let toker_next_index = 0;

// Current line number
let toker_line_no = 0;

// When set, whitespaces are the only separators, as in Forth
// This is activated after a "to" to get the verb name.
let toker_eager_mode = false;

// One token ahead sometime, see unget_token()
let back_token_type = 0;

// The text value of that back token
/**/ let  back_token_text = "";
//c/ static Text back_token_text(  "" );

// The line number of that back token in the source
let back_token_line_no = 0;

// The column number of that back token in the source
let back_token_column_no = 0;

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

// The length of that token
let token_length = 0;

// The first character of that token
/**/ let token_first_ch = "";
//c/ static Text token_first_ch(  "" );

// The last character of that token
/**/ let token_last_ch = "";
//c/ static Text token_last_ch(  "" );

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
let toker_first_comment_seen = false;


function set_comment_multi_line( begin : TxtC, end : TxtC ){
  comment_multiline_begin = begin;
  comment_multiline_ch0 = tsome( begin ) ? begin[ 0 ] : no_ch;
  comment_multiline_end = end;
  comment_multine_last_ch = tsome( end ) ? end[ tlen( end ) - 1 ] : no_ch;
}


function set_comment_mono_line( begin : TxtC ){
  comment_monoline = begin;
  comment_monoline_ch0 = tsome( begin ) ? begin[ 0 ] : no_ch;
  set_comment_multi_line( no_text, no_text );
}


function set_style( new_style : TxtC ){
// Set the new style for future tokens detections

  set_alias_style( new_style );

  if( teq( new_style, "inox" ) ){
    set_comment_mono_line( "~~" );
    set_comment_multi_line( "~|", "|~" );
    // Using "to" is Logo style, it is turtles all the way down
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
  toker_first_comment_seen = true;

}


function tokenizer_set_literate_style( is_it : boolean ){
  is_literate = is_it;
}


/**/ function tokenizer_set_stream( s : TextStreamIterator ){
//c/ void     tokenizer_set_stream( int s ) {
  toker_stream = s;
}


// Globals for the tokenizer
/**/ let  toker_ch = "";
//c/ static Text toker_ch( "" );
let toker_is_eol = false;
let toker_is_eof = false;
let toker_index_of_last_eol = 0;
let toker_index_of_previous_eol = 0;
let toker_previous_index = 0;
let token_is_ready = false;
let toker_is_space = false;
let toker_front_spaces = 0;
let toker_state = 0;
/**/ let  toker_buf = "";
//c/ static Text toker_buf( "" );
let style_is_forth = false;
let toker_start_index = 0;
let toker_is_limit = false;
let toker_previous_state = 0;


function tokenizer_restart( source : TxtC ){

  // The source code to process
  /**/ toker_stream = null;
  toker_text        = source;
  toker_text_length = tlen( source );

  // Track progress in the source code
  toker_next_index  = 0;
  toker_line_no  = 1;
  toker_index_of_last_eol = -1;

  // Default style
  set_style( "inox" );

  // First char of source code defines style of comments and aliases
  toker_first_comment_seen = false;

  // Obviously there is no previously detected token to deliver
  back_token_type = 0;

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
  tokenizer_restart( cell_as_text( TOS ) );
  drop();
}
primitive( "start-input", primitive_inox_start_input );


/*
 *  input - get next character in source code, or ""
 */

function tokenizer_next_character() : Text {
// Get/consume next character and advance cursor, or ""
  // ToDo: handle stream
  if( toker_next_index >= toker_text_length )return "";
  /**/ const ch = toker_text[ toker_next_index ];
  //c/ Text  ch = toker_text.substr( toker_next_index, 1 );
  toker_next_index += 1;
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
  const top = TOS;
  let auto_limit = cell_as_text( top );
  clear( top );
  let auto_ = S();
  let auto_ch  = S();
  while( true ){
    auto_ch = tokenizer_next_character();
    if( teq( auto_ch, "" ) ){
      // Return void if source is empty
      clear( top );
      return;
    }
    if( teq( auto_ch, auto_limit ) ){
      set_text_cell( top, auto_ );
      set_name( top, tag_token );
      return;
    }
    auto_ += auto_ch;
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
  const cell = pop();
  const n = name_of( cell );
  // ToDo: should handle the token type properly
  const typ = token_tag_to_type( n );
  unget_token( typ, cell_as_text( cell ) );
  clear( cell );
}
primitive( "pushback-token", primitive_pushback_token );


function ch_is_space( ch : ConstText ) : boolean {
  // ToDo: faster
  /**/return  tidx( " \n\r\t", ch ) >= 0;
  /*c{
    return teq( ch, "\n" )
    ||     teq( ch, "\r" )
    ||     teq( ch, "\t" )
    ||     teq( ch, " " );
  }*/
}


/*
 *  whitespace? - true if TOS is a whitespace character
 */

const tag_is_whitespace = tag( "whitespace?" );

primitive( "whitespace?", primitive_inox_is_whitespace );
function                  primitive_inox_is_whitespace(){
// True if the text top of stack is a whitespace character
  const auto_ = cell_as_text( TOS );
  drop();
  push_boolean( ch_is_space( auto_ ) );
  set_tos_name( tag_is_whitespace );
}


/*
 *  next-character - get next character in source code, or ""
 */

const tag_next_character = tag( "next-character" );

function primitive_next_character(){
  const auto_ = tokenizer_next_character();
  push_text( auto_ );
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
  const auto_ = cell_as_text( TOS );
  drop();
  push_boolean( ch_is_digit( auto_ ) );
  set_tos_name( tag_is_digit );
}
primitive( "digit?", primitive_is_digit );


/*
 *  eol? - true if the top of stack is an end of line character
 */

const tag_is_eol = tag( "eol?" );


function ch_is_eol( ch : ConstText ) : boolean {
  // ToDo: handle crlf better
  if( tneq( ch, "\n" ) && tneq( ch, "\r" ) )return false;
  return true;
}


function primitive_is_eol(){
  const auto_ = cell_as_text( TOS );
  drop();
  push_boolean( ch_is_eol( auto_ ) );
  set_tos_name( tag_is_eol );
}
primitive( "eol?", primitive_is_eol );


/*
 *  next-token - read the next token from the default input stream
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

    case token_type_indentation :
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


function extract_line( txt : TxtC, ii : Index, mark : Text ) : Text {
// Extract the line surrounding the position ii in text

  // Handle negative indices
  if( ii < 0 ){
    ii = tlen( txt ) + ii;
  }

  // Get whatever is after next eol
  let auto_back = tbut( txt, ii );
  let index = tidx( auto_back, "\n" );
  if( index != -1 ){
    auto_back = tcut( auto_back, index );
  }

  // Get whatever is before, up to previous eol
  let auto_front = tcut( txt, ii );
  index = tidxr( auto_front, "\n" );
  if( index != -1 ){
    auto_front = tbut( auto_front, index + 1 );
  }

  let auto_line_extract = S() + auto_front + mark + auto_back;
  if( tlen( auto_line_extract ) > 70 ){
    auto_line_extract = tcut( auto_line_extract, 70 ) + "...";
  }

  return auto_line_extract;
}


function ch_is_limit( ch : TxtC, next_ch : TxtC ) : boolean {

  // Space is always a delimiter
  if( teq( ch, " " ) )return true;

  // :, ;, / and ( are delimiters in some cases

  // xxx; is xxx ; not xxx;, only when next character is some space
  if ( teq( ch, ";" ) && tneq( next_ch, " " ) )return true;

  // xxx/yyy is xxx/ yyy, not xxx/yyy, unless xxx/(
  if( teq( ch, "/" ) && tneq( next_ch, "(" ) )return true;

  // xxx()yyy is xxx( and then )yyy, not xxx()yyy
  if( teq( ch, "(" ) && teq( next_ch, ")" ) )return true;

  return false;

}


// Some small lookahead to detect some constructs
/**/ let  toker_next  = "    ";
//c/ static Text toker_next( "    " );

/**/ let toker_next_1 = "";
//c/ static Text toker_next_1( "" );

// Position of those next character in source code
let toker_refill_index = 0;


function refill_next( ii : Index ){
  // Don't do it twice if same location, for speed
  if( toker_refill_index == ii )return;
  let jj;
  toker_next = "";
  for( jj = 0 ; jj < 4 ; jj++ ){
    if( ( ii + jj ) >= toker_text_length ){
      toker_next += " ";
    }else{
      /**/ toker_next += toker_text[ ii + jj ];
      //c/ toker_next += tat( toker_text, ii + jj );
      // Treat lf like a space
      if( ch_is_eol( tat( toker_next, jj ) ) ){
        toker_next = tcut( toker_next, jj ) + " ";
      }
    }
  }
  toker_next_1 = tcut( toker_next, 1 );
  toker_refill_index = ii;
}


function handle_literate_style( buf : TxtC ) : Text {

  // See https://github.com/cognate-lang/cognate

  // ToDo: this assert fails, why? de&&mand( buf.length > 0 );

  if( ! is_literate )return buf;
  if( teq( buf, "." ) )debugger;

  // If word does not depend on case, leave it alone, not a comment
  if( teq( tlow( buf ), tup( buf ) ) )return buf;

  // If the word is one letter long then it is a comment
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
    // If so, it is a line that is too big, file is unfit to proceed
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
    if( ! result ){
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


/* -----------------------------------------------------------------------------
 *  next_token(). It is a state machine that consumes characters from the input
 *  stream and produce tokens.
 *  There is a base state and 3 states for each token type: comments, texts and
 *  words.
 *  Once initialized using the toker_restart() function, the tokenizer then
 *  produces tokens one at a time using the next_token() function.
 *  It updates some global variables about the new token:
 *    toker_type, toker_text, toker_line_no and toker_column_no.
 *  While the tokenizer moves forward, global toker_ch is updated and
 *  toker_next_index is the index of the next character.
 */

/*
 *  Tokenizer processing of whitespaces between tokens
 */

function process_whitespaces(){

  // EOF, end of file
  if( toker_next_index == toker_text_length ){
    // If there is a stream, try to get more text from it
    if(
      /**/ toker_stream
      //c/ toker_stream >= 0
    ){
      /**/ const more_text = toker_stream.next();
      /*c{
        Text more_text( fast_getline( toker_stream ) );
      }*/
      if( tsome( more_text ) ){
        toker_text = more_text;
        toker_text_length = tlen( more_text );
        /**/ toker_ch = more_text[ 0 ];
        //c/ toker_ch = more_text.substr( 0, 1 );
        toker_next_index = 1;
        toker_previous_index = 0;
      }else{
        toker_is_eof = true;
      }
    }else{
      toker_is_eof = true;
    }
    if( toker_is_eof
    && toker_state != token_type_word
    && toker_state != token_type_comment
    ){
      toker_start_index = toker_text_length;
      token_type = token_type_eof;
      token_is_ready = true;
      return;
    }
    // Simulate a space to end the current word
    toker_ch = " ";

  // Get the next character in source
  }else{
    /**/ toker_ch = toker_text[ toker_next_index ];
    //c/ toker_ch = toker_text.substr( toker_next_index, 1 );
    toker_next_index += 1;
  }

  // Is it some space or something equivalent?
  toker_is_space = ch_is_space( toker_ch );
  toker_is_eol   = toker_is_space && ch_is_eol( toker_ch );

  // Normalize all whitespaces into a single space character
  if( toker_is_space
  && toker_state != token_type_comment
  && toker_state != token_type_text
  ){
    toker_ch = " ";
  }

  // If end of line, detect it
  if( toker_is_eol ){
    // Line numbering, don't double when \r\n
    if( tneq( toker_ch, "\r" ) ){
      // Update current line number
      toker_line_no += 1;
      // Update index of last and previous new line characters
      if( toker_index_of_last_eol >= 0 ){
        toker_index_of_previous_eol = toker_index_of_last_eol;
      }else{
        toker_index_of_previous_eol = 0;
      }
      toker_index_of_last_eol = toker_next_index - 1;
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
      token_column_no = toker_front_spaces + 1;
      toker_previous_indentation = toker_indentation;
      toker_indentation = toker_front_spaces;
      // Emit either "++", "--" or "==" indentation token
      if( toker_state == token_base ){
        token_type = token_type_indentation;
        if( toker_indentation > toker_previous_indentation ){
          token_text = "++";
        }else if( toker_indentation < toker_previous_indentation ){
          token_text = "--";
        }else{
          token_text = "==";
        }
        token_is_ready = true;
        // Make sure first non space is processed normally next time
        toker_next_index -= 1;
      }
    }
  }
} // process_whitespaces()


/*
 *  Tokenizer "base" state handling
 */

function process_base_state(){

  // skip whitespaces, including separators
  // ToDo: handle separator sign ("," if Inox) with more semantic
  if( toker_is_space ){
    return;
  }

  // Texts start with ", unless Forth
  // ToDo: make it configurable?
  if( teq( toker_ch, "\"" ) && ! style_is_forth ){
    // ToDo: handle single quote 'xx' and backquote `xxxx`
    // ToDo: handle template text literals, ie fmt"..."
    toker_start_index = toker_next_index - 1;
    toker_state = token_type_text;
    return;
  }

  // Comments start differently depending on style
  toker_buf += toker_ch;
  de&&mand( tsome( toker_buf ) );

  // If literate style, a line starting without indentation is a comment
  if( is_literate
  &&  toker_indentation_reached
  &&  toker_indentation == 0
  ){
    toker_state = token_type_comment;
    // The new ch will be added when processing the comment state
    toker_buf = tcut( toker_buf, -1 );
    token_de&&mand_eq( toker_start_index, toker_next_index - 1 );
    toker_state = token_type_comment;
    process_comment_state();
    return;
  }

  // If actual start of comment, change state
  if( teq( toker_buf, comment_monoline )
  ||  teq( toker_buf, comment_multiline_begin )
  ){
    toker_start_index = toker_next_index - tlen( toker_buf );
    // The new ch will be added when processing the comment state
    toker_buf = tcut( toker_buf, -1 );
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
  toker_start_index = toker_next_index - 1;
  toker_state = token_type_word;
  process_word_state();

} // process_base_state()


/*
 *  Tokenizer "comment" state handling
 */

function process_comment_state(){

  // Add new charater to buffer
  toker_buf += toker_ch;

  // When inside the first comment at the very beginning of the file
  // Different programming language have different styles
  // Icon uses literate programming with code lines started using >
  // See https://en.wikipedia.org/wiki/Comment_(computer_programming)

  if( ! toker_first_comment_seen && ! toker_is_space ){

    // ToDo: skip #! shebang
    // see https://en.wikipedia.org/wiki/Shebang_(Unix)

    // Inox style of comments, ~~ and ~| xxx |~
    if( teq( toker_ch, "~" ) ){
      set_style( "inox" );

    // sh shell type of comments, #
    }else if( teq( toker_ch, "#" ) ){
      set_style( "sh" );

    // C style of comments, either // or /*xxx*/
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
    if( tsome( comment_monoline ) && tpre( comment_monoline, toker_buf ) ){
      // Emit token, without start of comment sequence and without lf
      token_type = token_type_comment;
      token_text = tmid( toker_buf, tlen( comment_monoline ), -1 );
      token_is_ready = true;
      return;
    }
    // Literate style of comments
    if( is_literate ){
      // Emit token, whole line without lf
      token_type = token_type_comment;
      token_text = tcut( toker_buf, -1 );
      token_is_ready = true;
      return;
    }
  }

  // If this terminates the multiline comment, emit the comment
  if( teq( toker_ch, comment_multine_last_ch )
  &&  tpre( comment_multiline_begin, toker_buf )
  &&  tsuf( comment_multiline_end,   toker_buf )
  ){
    // Emit token, without start & end of comment sequence
    token_type = token_comment_multiline;
    token_text = tmid( toker_buf,
      tlen(   comment_multiline_begin ),
      - tlen( comment_multiline_end   )
    );
    token_is_ready = true;
    return;
  }

  // Premature end of file, something else was expected
  if( toker_is_eof ){
    // Generate an error token this time and eof next time
    token_type = toker_first_comment_seen
    ? token_type_error
    : token_type_eof;
    toker_text = toker_first_comment_seen
    ? S() + "eof in token state " + N( toker_state )
      + " (" + token_type_as_text( toker_state ) + ")"
    : no_text;
    token_is_ready = true;
    // Will generate eof token next time
    toker_first_comment_seen = true;
    return;
  }

} // process_comment_state()


/*
 *  Tokenizer "text" state handling
 */

function process_text_state(){

  // " marks the end of the text token
  if( teq( toker_ch, "\"" ) ){
    token_type  = token_type_text;
    // Handle escape sequences
    toker_buf = text_unquote( toker_buf );
    token_text = toker_buf;
    token_is_ready = true;
  }

  // Add new character to being built token
  toker_buf += toker_ch;

  // New lines are ok inside a "xxxx" text token
  if( teq( toker_ch, "\n" ) ){
    toker_line_no += 1;
  }

} // process_text_state()


/*
 *  Tokenizer "word" state handling
 */

function token_eat() : boolean {
// Add new character to being built token
  toker_buf = toker_buf + toker_ch;
  toker_next_index += 1;
  return false;
}


function process_word_state(){

  // ToDo: this assert fails, why? de&&mand( buf.length > 0 );

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

    // If no alias, emit the word
    if( tnone( auto_aliased ) ){
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }

    // If simple word substitution with an alias
    if( tidx( auto_aliased, " " ) == -1 ){
      toker_buf = auto_aliased;
      token_text = toker_buf;
      token_is_ready = true;
      return;
    }

    token_de&&bug( S()+ "Alias for " + toker_buf + " is " + auto_aliased );
    // When this happens, replace and go back to base state
    // ToDo: this is very inefficient
    toker_text
    = tcut( toker_text, toker_start_index )
    + auto_aliased
    + tbut( toker_text, toker_next_index );
    toker_text_length  = tlen( toker_text );
    toker_next_index = toker_start_index;
    toker_buf = "";
    toker_state = token_base;
    return;
  }

  legacy_de&&mand( ! toker_is_space );

  // If eager mode then only space is a terminator
  if( style_is_forth
  ||  toker_eager_mode
  ){
    toker_buf += toker_ch;
    return;
  }

  // ToDo: what comes next needs some serious refactoring

  // Get some next characters, some lookahead helps sometimes
  refill_next( toker_next_index );

  // Comma is ignored when followed by space, it is there for readability only
  if( teq( toker_ch, "," ) && teq( toker_next_1, " " ) ){
    return;
  }

  // Handle line continuation when \ is last character on line
  // ToDo: should be defined by style
  if( teq( toker_ch, "\\" )
  && ch_is_space( toker_next_1 )
  // ToDo: check that pseudo space is actually cr or lf
  ){
    toker_next_index++;
    // Handle crlf, skip cr when followed by lf
    if( teq( toker_ch, "\r" ) &&  teq( toker_next_1, "\n" ) ){
      toker_next_index += 1;
    }
    return;
  }

  // . is a token if followed by some space
  if( teq( toker_ch, end_define ) ){
    toker_is_limit = ch_is_space( toker_next_1 );

  // ; is a token if followed by some space or .
  }else if( teq( toker_ch, terminator_sign ) ){
    toker_is_limit
    = ch_is_space( toker_next_1 ) || teq( toker_next_1, end_define );

  // Some other special characters are a limit too
  }else{
    toker_is_limit = ch_is_limit( toker_ch, toker_next_1 );
  }

  // If no delimiter is reached, keep going
  if( ! toker_is_limit ){
    toker_buf += toker_ch;
    return;
  }

  // Some potential limit is reached, deal with it

  // If there was nothing before the non space delimiter, emit a single char
  if( tnone( toker_buf ) && ! toker_is_space ){
    if( teq( toker_ch, "/" ) ){
      toker_buf = "/";
      return;
    }
    toker_start_index = toker_next_index - 1;
    toker_buf = toker_ch;
    token_text = toker_buf;
    token_is_ready = true;

  // If there was something before the limit, deal with that
  }else{

    // ToDo: refactor, . should be configurable
    if( teq( toker_ch, "." ) ){
      // Don't token_eat(), it will stand for itself
      if( teq( tbut( toker_buf, -1 ), "." ) ){
        // Special case when consecutive dots, they go together
        token_eat();
      }

    // xx(, xx{, xx[ and xx" are words of a special type
    // so is xxx: when before a space or /xxx/yyy which is /xxx
    } else if( teq( toker_ch, "(" )
    ||  teq( toker_ch, '[' )
    ||  teq( toker_ch, '{' )
    ||  teq( toker_ch, '"' )
    ||  ( teq( toker_ch, ':' ) && teq( toker_next_1, " " ) )
    ||  ( teq( toker_ch, '/' ) && tneq( tcut( toker_buf, 1 ), "/" ) )
    ){
      token_eat();

    // ) and } are also words of a special type
    } else if(
      ( teq( toker_ch, ")" ) || teq( toker_ch, "}" ) )
    && ch_is_limit( toker_next_1, "" )
    ){
      token_eat();
    }

    // A well separated word was collected, before or with the limit
    toker_next_index -= 1;

    // Change word if some alias was defined for it
    if( is_literate ){
      toker_buf = handle_literate_style( toker_buf );
    }

    let auto_word_alias = alias( toker_buf );

    // In Inox style the aliases can expand into multiple words
    if( tsome( auto_word_alias ) && teq( the_style, "inox" ) ){
      // Complex case, potentially expand into multiple tokens
      let index_space = tidx( auto_word_alias, " " );
      if( index_space != -1 ){
        token_de&&bug( S()+
          "alias for " + toker_buf + " is " + auto_word_alias
        );
        // When this happens, replace and go back to base state
        // ToDo: this is very inefficient
        toker_text
        = tcut( toker_text, toker_start_index )
        + auto_word_alias
        + tbut( toker_text, toker_next_index );
        toker_text_length  = tlen( toker_text );
        toker_next_index = toker_start_index;
        toker_buf = "";
        toker_state = token_base;
        return;
      }
    }

    if( tsome( auto_word_alias ) ){
      toker_buf = auto_word_alias;
    }
    token_text = toker_buf;
    token_is_ready = true;

  }
} // process_word_state()


function detect_infinite_loop(){
  if( ! de )return;
  if( toker_next_index == toker_previous_index
  && toker_state == toker_previous_state
  ){
    bug( "Infinite loop detected in next_token" );
    debugger;
    // Skip to end of file
    toker_next_index = toker_text_length;
  }
  toker_previous_index = toker_next_index;
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
    token_type      = back_token_type;
    token_text      = back_token_text;
    token_line_no   = back_token_line_no;
    token_column_no = back_token_column_no;
    back_token_type = 0;
    back_token_text = "";
    return;
  }

  // Where the new token may start, unless forward due to some white spaces
  toker_start_index = toker_next_index;

  // New token, temporarely an empty token_word type of token
  token_type      = token_type_word;
  token_text      = "";
  token_column_no = 0;

  // State machine starts in base state unless first comment was not seen
  toker_state = toker_first_comment_seen ? token_base : token_type_comment;

  // Buffer to collect the token text
  toker_buf = "";

  // One character at a time
  toker_ch       = "";
  toker_is_space = false;
  toker_is_eol   = false;
  toker_is_eof   = false;

  // Space is the normal deliminator between words, there are special cases
  toker_is_limit = false;

  // Number of spaces before the token, used to detect indentation changes
  toker_front_spaces = 0;

  // Previous character position, used to detect infinite loops
  toker_previous_index    = -1;
  toker_previous_state = token_type_error;

  // Forth style is much simpler, almost only white spaces and words
  style_is_forth = teq( the_style, "forth" );

  // Loop until a token is ready
  token_is_ready = false;
  while( ! token_is_ready ){
    detect_infinite_loop();
    process_whitespaces();
    if( token_is_ready )break;
    // State machine
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

  de&&mand( token_is_ready );
  token_length   = tlen( token_text );
  token_first_ch = tcut( token_text,  1 );
  token_last_ch  = tbut( token_text, -1 );

  token_line_no = toker_line_no;
  // If last seen character is eol, true token line number is actually one less
  if( toker_is_eol ){
    token_line_no -= 1;
  }

  // Compute column number of token unless already done, 1 based
  if( token_column_no == 0  ){
    // Special case when before first new line character
    if( toker_index_of_last_eol < 0 ){
      token_column_no = toker_start_index + 1;
    // Normal case when after some new line character
    }else{
      // When after last seen new line character
      if( toker_start_index > toker_index_of_last_eol ){
        token_column_no = toker_start_index - toker_index_of_last_eol;
      // When after previous new line character (whose position defaults to 0)
      }else{
        token_column_no = toker_start_index - toker_index_of_previous_eol;
      }
    }
    // 1 based, not zero based
    token_de&&mand( token_column_no >= 1 );
  }

  if( token_de ){
    bug( S()+ "\n"
      + "Token. Next is "
      + token_type_as_text( token_type )
      + " \"" + token_text + "\""
      + ", index "  + N( toker_start_index )
      + ", line "   + N( token_line_no )
      + ", column " + N( token_column_no )
      + " \"" + extract_line( toker_text, toker_start_index, "[TOKEN]" ) + "\""
    );
  }

} // next_token()


/* ------------------------------------------------------------------------
 *  Basic tests of the tokenizer
 */

//c/ void test_token( Index, TxtC );

function test_tokcol( typ : Index, val : TxtC, col : Index ){

  // Save tokenizer context
  const save_cursor  = toker_next_index;
  const save_seen    = toker_first_comment_seen;
  const save_reached = toker_indentation_reached;

  next_token();

  // Skip indentation related tokens
  if( token_type == token_type_indentation ){ next_token(); }

  let error = false;
  if( token_type != typ ){
    bug( S()
      + "Bad type from next_token(), "
      + token_type_as_text( token_type )
      + " vs expected " + token_type_as_text( typ ) + "."
    );
    error = true;
  }
  if( tneq( token_text, val ) ){
    bug( S()
      + "Bad value from next_token(), " + token_text
      + " vs expected " + val + "."
    );
    error = true;
  }
  if( col != 0 && token_column_no != col ){
    bug( S()
      + "Bad column from next_token(), " + N( token_column_no )
      + " vs expected " + N( col ) + "."
    );
    error = true;
  }

  if( error ){
    // Restore tokenizer context to retry under debugger
    toker_next_index             = save_cursor;
    toker_first_comment_seen  = save_seen;
    toker_indentation_reached = save_reached;
    debugger;
    // This is convenient for interactive debugging
    test_token( typ, val );
  }

} // test_tokcol()


function test_token( typ : Index, val : TxtC ){
  return test_tokcol( typ, val, 0 );
}


function test_tokenizer() : Index {

  tokenizer_restart( "" );
  test_tokcol( token_type_eof, "", 1 );

  tokenizer_restart( "#!/bin/inox\n#ok" );
  test_tokcol( token_type_comment, "!/bin/inox", 1 );
  test_tokcol( token_type_comment, "ok",         1 );
  test_tokcol( token_type_eof,     "",           4 );

  tokenizer_restart(  "/**/" );
  test_tokcol( token_comment_multiline, "", 1 );
  test_tokcol( token_type_eof,          "", 5 );

  tokenizer_restart(  "~| test |~~~ test" );
  test_tokcol( token_comment_multiline, " test ",  1 );
  test_tokcol( token_type_comment,      " test",  11 );
  test_token(  token_type_eof,          ""           );

  tokenizer_restart( "~~ test\n~| test |~ \"he\" \"\"" );
  test_tokcol( token_type_comment,      " test",  1 );
  test_tokcol( token_comment_multiline, " test ", 1 );
  test_token(  token_type_text,         "he"        );
  test_token(  token_type_text,         ""          );
  test_token(  token_type_eof,          ""          );

  tokenizer_restart( "( test1 )\\\n\\test2" );
  test_tokcol( token_comment_multiline, " test1 ", 1 );
  test_token(  token_type_comment,      ""           );
  test_tokcol( token_type_comment,      "test2",   1 );
  test_token(  token_type_eof,          ""           );

  tokenizer_restart( "() 0 1234 \",\" + : abc, ; , ." );
  test_tokcol( token_comment_multiline, "",      1 );
  test_tokcol( token_type_word,         "0",     4 );
  test_tokcol( token_type_word,         "1234",  6 );
  test_tokcol( token_type_word,         "\",\"", 0 );
  test_token(  token_type_word,         "+"        );
  test_token(  token_type_word,         ":"        );
  test_token(  token_type_word,         "abc,"     );
  test_token(  token_type_word,         ";"        );
  test_token(  token_type_word,         ","        );
  test_token(  token_type_word,         "."        );
  test_token(  token_type_eof,          ""         );

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

  tokenizer_restart( "~~\n a, b;,. [[ ]] #[ ]# x.[ ] };" );
  test_token( token_type_comment, "" );
  test_token( token_type_word, "a"   );
  test_token( token_type_word, "b;," );
  test_token( token_type_word, "."   );
  test_token( token_type_word, "[["  );
  test_token( token_type_word, "]]"  );
  test_token( token_type_word, "#["  );
  test_token( token_type_word, "]#"  );
  test_token( token_type_word, "x.[" );
  test_token( token_type_word, "]"   );
  test_token( token_type_word, "}"   );
  test_token( token_type_word, ";"   );
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
  test_token( token_comment_multiline, ""  );
  test_token( token_type_word, "to"        );
  test_token( token_type_word, "debugger"  );
  test_token( token_type_word, "debugger"  );
  test_token( token_type_word, "."         );
  test_token( token_type_eof,  ""          );

  tokenizer_restart(
    "~~\n to aa ct: void .. is: as_v( 0 :void );bb. .). .. X."
  );
  test_token( token_type_comment, ""   );
  test_token( token_type_word, "to"    );
  test_token( token_type_word, "aa"    );
  test_token( token_type_word, "ct:"   );
  test_token( token_type_word, "void"  );
  test_token( token_type_word, ".."    );
  test_token( token_type_word, "is:"   );
  test_token( token_type_word, "as_v(" );
  test_token( token_type_word, "0"     );
  test_token( token_type_word, ":void" );
  test_token( token_type_word, ");bb"  );
  test_token( token_type_word, "."     );
  test_token( token_type_word, ".)"    );
  test_token( token_type_word, "."     );
  test_token( token_type_word, ".."    );
  test_token( token_type_word, "X"     );
  test_token( token_type_word, "."     );
  test_token( token_type_eof, ""       );

  tokenizer_restart(
    "~||~ to ct:is: aa:bb :id .x! x| |x |x!"
  );
  test_token( token_comment_multiline, "" );
  test_token( token_type_word, "to"     );
  test_token( token_type_word, "ct:is:" );
  test_token( token_type_word, "aa:bb"  );
  test_token( token_type_word, ":id"    );
  test_token( token_type_word, ".x!"    );
  test_token( token_type_word, "x|"     );
  test_token( token_type_word, "|x"     );
  test_token( token_type_word, "|x!"    );
  test_token( token_type_eof, ""        );

  tokenizer_restart(
    "~||~ it .x dup .:m d .m: m() dup .m() a:, b:"
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
  test_token( token_type_word, "a:"   );
  test_token( token_type_word, "b:"   );
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
primitive( "literate!", primitive_set_literate );


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
const tag_run_method          = tag( "run-method"          );
const tag_get_local           = tag( "local"               );
const tag_set_local           = tag( "local!"              );
const tag_data                = tag( "data"                );
const tag_set_data            = tag( "data!"               );
const tag_object_at           = tag( "object.@"            );
const tag_object_set          = tag( "object.!"            );


/*
 *  integer-text? - true if text is valid integer
 */

const tag_is_integer = tag( "integer?" );

function text_is_integer( buf : ConstText ) : boolean {
  /**/ return ! isNaN( parseInt( buf ) );
  /*c{
    // ToDo: bugs when too big
    TxtC str = buf.c_str();
    for( unsigned int ii = 0 ; ii < buf.length() ; ii++ ){
      if( ! isdigit( str[ ii ] ) ){
        // minus sign is ok if it is the first character
        if( ii == 0 && str[ ii ] == '-' )continue;
        return false;
      }
    }
    return true;
  }*/
}


function primitive_text_is_integer(){
  de&&mand_cell_type( TOS, tag_text );
  const auto_ = cell_as_text( TOS );
  clear( TOS );
  push_boolean( text_is_integer( auto_ ) );
  set_tos_name( tag_is_integer );
}
primitive( "text.integer?", primitive_text_is_integer );


/*
 *  parse-integer - convert a text to an integer, or /NaN if not possible
 */

const tag_parse_integer = tag( "parse-integer" );
const tag_NaN = tag( "NaN" );


function integer_from_text( buf : ConstText ) : Value {
  // This function is called after is_integer() has returned true
  /**/ const parsed = parseInt( buf );
  /**/ de&&mand( ! isNaN( parsed ) );
  /**/ return parsed |0;
  /*c{
    // ToDo: handle overflow
    TxtC str = buf.c_str();
    bool is_negative = false;
    if( str[ 0 ] == '-' ){
      is_negative = true;
      str++;
    }
    int num = 0;
    for( int ii = 0 ; str[ ii ] != '\0' ; ii++ ){
      num = num * 10 + ( str[ ii ] - 48 );
    }
    if( is_negative ){
      num = -num;
    }
    return num;
  }*/
}


function primitive_text_as_integer(){
  de&&mand_cell_type( TOS, tag_text );
  const auto_ = cell_as_text( TOS );
  clear( TOS );
  /*ts{*/
    const parsed = parseInt( auto_ );
    if( isNaN( parsed ) ){
      push_tag( tag_NaN );
    } else {
      push_integer( parsed );
      set_tos_name( tag_parse_integer );
    }
  /*}*/
  /*c{
    if( ! text_is_integer( auto_ ) ){
      push_tag( tag_NaN );
    } else {
      push_integer( integer_from_text( auto_ ) );
      set_tos_name( tag_parse_integer );
    }
  }*/
}
primitive( "text.as-integer", primitive_text_as_integer );


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


const tag_scope      = tag( "scope"      );
const tag_make_local = tag( "make.local" );
const tag_make_data  = tag( "make.data"  );


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

const parse_top_level     = 1;
const parse_definition    = 2;
const parse_call          = 3;
const parse_subexpr       = 4;
const parse_keyword       = 5;
const parse_call_block    = 6;
const parse_infix         = 7;
const parse_block         = 8;



function parse_type_as_text( type : Index ) : Text {
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

const tag_block_start  = tag( "block-start" );
const tag_block_scoped = tag( "block-scoped" );
const tag_line_no      = tag( "line-no" );
const tag_column_no    = tag( "column-no" );

// This is a stack of parsing contexts, a simplified AST
let parse_stack = 0;

// Everything about the current parse context, they nest
let parse_depth        = 0;
let parse_type         = 0;
/**/ let  parse_name   = "";
//c/ static Text parse_name( "" );
let parse_verb         = 0;
let parse_block_start  = 0;
let parse_block_scoped = 0;
let parse_line_no      = 0;
let parse_column_no    = 0;

// When a verb is defined, it's code is stored in a block
let eval_is_parsing_a_new_verb = false;

// What is the source code line number of the current parse context?
let eval_source_line_no = 0;

// What is the source code column number of the current parse context?
let eval_source_column_no = 0;

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
  let auto_ = S();
  auto_ += "Parser. Levels. " + S() + title + " ";
  // Each level has type, name, verb, block_start, line_no, column_no
  // That's 6 cells per level
  auto_ += stack_split_dump( parse_stack, 6 );
  trace( auto_ );
  return true;
}

// Number of cells per parse level
const parse_state_length = 7;

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

  // parse_block_scoped
  set( the_tmp_cell, type_boolean, tag_block_scoped, parse_block_scoped );
  stack_push( parse_stack, the_tmp_cell );

  // parse_line_no
  set( the_tmp_cell, type_integer, tag_line_no, token_line_no );
  stack_push( parse_stack, the_tmp_cell );

  // parse_column_no
  set( the_tmp_cell, type_integer, tag_column_no, token_column_no );
  stack_push( parse_stack, the_tmp_cell );

  // That's a total of 7 cells per parse level
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

  // parse_block_scoped
  c = stack_pop( parse_stack );
  parse_block_scoped = eat_integer( c );

  // parse_block_start
  c = stack_pop( parse_stack );
  parse_block_start = eat_integer( c );

  // parse_verb
  c = stack_pop( parse_stack );
  parse_verb = eat_integer( c );

  // parse_name
  c = stack_pop( parse_stack );
  parse_name = cell_as_text( c );
  clear( c );

  // parse_type
  c = stack_pop( parse_stack );
  parse_type = eat_integer( c );

}



/*
 *  compiler-enter - Entering a new parse context
 */

function parse_enter( type : Index, name : TxtC ){
// Entering a ( xx yy ), a f( xx yy ), a key: x word: y; or a {} block

  // Save the current parse context using the parse stack
  push_parse_state();

  // Update global parse variables for new context
  parse_depth = stack_length( parse_stack ) / parse_state_length;
  parse_type  = type;
  // Level 1 is the top level, levels 2 are verb definitions
  de&&mand( parse_depth != 1 || parse_type == parse_top_level );
  de&&mand( parse_type != parse_definition || parse_depth == 2 );
  parse_name        = name;
  parse_verb        = 0;
  if( token_line_no != 0 ){
    parse_line_no   = token_line_no;
    parse_column_no = token_column_no;
  }

  parse_de&&bug_parse_levels( S()
    + "Entering " + parse_type_as_text( type )
    + ", depth is " + N( parse_depth )
    + ( tneq( name, no_text ) ? ( S()+ ", name is " + name ) : no_text )
  );
}


/*
 *  compiler-leave - Leaving a parse context
 */


function parse_leave(){

  parse_de&&bug_parse_levels( S()
    + "Leaving " + parse_type_as_text( parse_type )
    + ", depth is " + N( parse_depth )
  );

  let previous_level_type = parse_type;
  let previous_level_verb = parse_verb;

  // Restore previous parse context using the parse stack
  pop_parse_state();
  parse_depth = stack_length( parse_stack ) / parse_state_length;
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
 *  compile-definition-begin - Entering a new verb definition
 */

function eval_definition_begin(){
// Called when entering a new verb definition, "to" if Inox dialect.

  // ToDo: should be an immediate primitive

  parse_enter( parse_definition, "" );
  eval_is_parsing_a_new_verb = true;
  if( parse_codes == 0 ){
    parse_codes = stack_preallocate( 1000 );
  }
  de&&mand( stack_length( parse_codes ) == 0 );

  // Next token, the verb name, is special, it is anything until some space
  parse_new_verb_name = "";
  toker_eager_mode = true;
  de&&mand( eval_is_expecting_the_verb_name() );

}


function primitive_compile_definition_begin(){
  eval_definition_begin();
}
immediate_primitive( "compile-definition-begin", primitive_compile_definition_begin );

/*
 *  compile-definition-end - Leaving a verb definition
 */

function eval_is_compiling() : boolean {
  if( eval_is_parsing_a_new_verb )return true;
  return false;
}


function define_verb( name : Tag, source_def : Cell, len : Length ){
// Set the new definition of a verb

  // Allocate cells, including space for length/flags header
  const header = allocate_cells( len + 1 );

  // Skip the header to get to the first code
  const def = header + 1 * ONE;

  // The header contains the number of codes
  set( header, type_integer, name, 0 );
  set_definition_length( def, len );

  // Copy new verb definition into newly allocated memory
  move_cells( source_def, def, len );

  // Add definition to the global symbol table
  register_verb_definition( name, def );

  // Update the global variable that definition flag setters use
  // ToDo: do that as soon as name is kown?
  the_last_defined_verb = name;
}


function eval_definition_end(){
// Called when terminating a new verb definition

  check_de&&mand( eval_is_compiling() );

  // Add a final return
  set_return_cell( the_tmp_cell );
  stack_push( parse_codes, the_tmp_cell );

  // About to store the definition in some never freed cells
  const verb_tag = tag( parse_new_verb_name );
  const len = stack_length( parse_codes );
  const def = stack_at( parse_codes, 0 );
  define_verb( verb_tag, def, len );

  if( de ){
    const chk_def = definition_by_name( parse_new_verb_name );
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

  eval_de&&bug( S()+ "\n" + text_of_verb_definition( verb_tag ) );

} // eval_definition_end()


function primitive_compile_definition_end(){
  eval_definition_end();
}
immediate_primitive( "compile-definition-end", primitive_compile_definition_end );


/*
 *  compiling? - Is the interpreter compiling?
 */

function primitive_is_compiling(){
  push_boolean( eval_is_compiling() );
}
primitive( "compiling?", primitive_is_compiling );


/*
 *  debug-info - set debug info about the instruction beeing executed
 */

let current_eval_file = 0;
/**/let current_eval_content = "";
//c/ static Text current_eval_content;

let current_debug_info = 0;

let debug_info_file = 0;
let debug_info_line = 0;
let debug_info_column = 0;


function debug_info_as_text( debug_info : u32 ) : Text {
  const file_tag = debug_info >> 16;
  const line     = ( debug_info & 0xFFFF ) >> 7;
  const column   = debug_info & 0x7F;
  return S()
  + tag_as_text( file_tag )
  + ":"  + N( line )
  + ":"  + N( column );
}


function primitive_debug_info(){
  const ip = IP - ONE;
  de&&mand_cell_type( ip, type_primitive );
  de&&mand_cell_name( ip, tag_debug_info );
  current_debug_info = value_of( IP - ONE );
  traced_file   =   current_debug_info >> 16;
  traced_line   = ( current_debug_info & 0xFFFF ) >> 7;
  traced_column =   current_debug_info & 0x7F;
  if( run_de || eval_de ){
    // Display file:line:col when not about the current file
    if( traced_file != current_eval_file ){
      trace( "\ndebug-info: " + debug_info_as_text( current_debug_info ) );
    // When about current file, display source code that is around the position
    }else{
      trace(
        "\ndebug-info: " + debug_info_as_text( current_debug_info )
        + "\n  " + extract_line_no( current_eval_content, traced_line - 1 )
        + "\n> " + extract_line_no( current_eval_content, traced_line )
        + "\n  " + text_pad( "", traced_column - 1 ) + "^"
        + "\n  " + extract_line_no( current_eval_content, traced_line + 1 )
        + "\n  " + extract_line_no( current_eval_content, traced_line + 2 )
      );
      // Breakpoint now unless somewhere else soon
      if( step_de && ! run_de && ! stack_de ){ breakpoint(); }
    }
  }
}
primitive( "debug-info", primitive_debug_info );


/*
 *  compiler-expecting? - Is the compiler expecting the verb to define?
 */

function eval_is_expecting_the_verb_name() : boolean {

  // Should be called in compile mode only
  de&&mand( eval_is_compiling() );
  if( parse_type != parse_definition )return false;

  // Initialy the name of the verb is unknown, it follows "to"
  let it_is = teq( parse_new_verb_name, no_text );

  // When expecting the name, eager mode must be on
  de&&mand( ! it_is || toker_eager_mode );

  return it_is;
}


function primitive_state_is_expecting(){
  push_boolean( eval_is_expecting_the_verb_name() );
}
primitive( "compiler-expecting?", primitive_state_is_expecting );


/*
 *  debug-info-file! - set debug info file name about the current source code
 */

function primitive_debug_info_set_file(){
  const auto_ = pop_as_text();
  debug_info_file = tag( auto_ );
  traced_file = debug_info_file;
}
primitive( "debug-info-file!", primitive_debug_info_set_file );


/*
 *  debug-info-file - get debug info file name about the current source code
 */

function primitive_debug_info_get_file(){
  push_tag( debug_info_file );
}


/*
 *  debug-info-line! - set line number about the current source code
 */

function primitive_debug_info_set_line(){
  debug_info_line = pop_integer();
  traced_line = debug_info_line;
}
primitive( "debug-info-line!", primitive_debug_info_set_line );


/*
 *  debug-info-line - get line number about the current source code
 */

function primitive_debug_info_get_line(){
  push_integer( debug_info_line );
}
primitive( "debug-info-line", primitive_debug_info_get_line );


/*
 *  debug-info-column! - set column number about the current source code
 */

function primitive_debug_info_set_column(){
  debug_info_column = pop_integer();
  traced_column = debug_info_column;
}
primitive( "debug-info-column!", primitive_debug_info_set_column );


/*
 *  compile-literal - Add a literal to the verb beeing defined
 */


function add_debug_info(){

  // Do nothing if not in some debug mode
  if( ! info_de
  &&  ! eval_de
  &&  ! run_de
  )return;

  // Do nothing is name of current file was deliberatly erased
  if( debug_info_file == 0 )return;

  // Idem if line number was erased
  if( debug_info_line == 0 )return;

  // Idem if column number was erased
  if( debug_info_column == 0 )return;

  // If no change, do nothing
  if( debug_info_file   == traced_file
  &&  debug_info_line   == traced_line
  &&  debug_info_column == traced_column
  ){
    return;
  }

  // Save current position to detect change next time
  traced_file   = debug_info_file;
  traced_line   = debug_info_line;
  traced_column = debug_info_column;

  // Pack into a single integer, 9 bits for line, 7 for column, 16 for file
  let file_tag = debug_info_file;
  if( file_tag > 1023 ){
    file_tag = tag_some_file;
  }
  let line_no = debug_info_line;
  if( line_no > 511 ){
    line_no = 511;
  }
  let column_no = debug_info_column;
  if( column_no > 127 ){
    column_no = 127;
  }
  const info = ( file_tag << 16 ) | ( line_no << 7 ) | column_no;

  // Add call to primitive debug-info into the verb being defined
  set( the_tmp_cell, type_primitive, tag_debug_info, info );
  stack_push( parse_codes, the_tmp_cell );

  if( parse_de ){
    trace( "Parse. compile debug-info: " + debug_info_as_text( info ) );
  }

}


function eval_do_literal(){
  eval_de&&bug( S()+ "Eval. push literal " + dump( TOS ) );
  if( eval_is_compiling()&& immediate_mode_level == 0 ){
    eval_de&&bug( S()+ "Eval. Compile literal " + dump( TOS ) );
    add_debug_info();
    stack_push( parse_codes, pop() );
    parse_de&&bug( S()
      + "Parse. Parse level "
      + parse_type_as_text( parse_type )
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


const tag_verb_from = tag( "verb.from" );

function eval_do_verb_literal( t : TxtC ){
  eval_de&&bug( S()+ "Eval. Do verb literal " + t );
  push_tag( tag( t ) );
  eval_do_literal();
  add_machine_code( tag_verb_from );
}


const tag_primitive_from = tag( "primitive.from" );

function eval_do_primitive_literal( t : TxtC ){
  eval_de&&bug( S()+ "Eval. Do primitive literal " + t );
  push_tag( tag( t ) );
  eval_do_literal();
  add_machine_code( tag_primitive_from );
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
 *  compile-verb - add a verb to the beeing defined block or new verb
 */

function add_machine_code( code : Tag ){
// Add a verb to the beeing built block or new verb

  de&&mand( eval_is_compiling() );

  // Inline code definition if it is very short or if verb requires it
  const def = definition_of( code );

  // The last code is always a return, hence the - 1
  const def_len = definition_length( def ) - 1;

  add_debug_info();

  // ToDo: don't inline the definition of "future" verbs, ie forward declared
  // ToDo: process "late binding" verbs, ie verbs whose definition is not known

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

  // Detect call to the scope verb to avoid inserting it for local variables
  if( code == tag_scope ){
    parse_block_scoped = 1;
    // ToDo: add "scoped" flag to verb definition?
  }

  parse_de&&bug( S()
    + "Parse. Parse level "
    + parse_type_as_text( parse_type )
    + ", with code for " + N( code ) + " " + tag_as_text( code )
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
      + N( tag ) + " /" + tag_as_text( tag )
    );

    // Remember in control stack what verb is beeing entered
    // ToDo: should use type_verb?
    // ToDo: optimize by returning to some "back-to-outer-interpreter"
    // This primitive would exit the inner interpreter and return to the
    // outer interpreter, which would then continue to execute the
    // next instruction. This would avoid the overhead of checking
    // against 0 whenever a "return" is executed. This optimization
    // requires using an exception to exit the inner interpreter.
    defer( tag, 0 );
    IP = definition_of( tag );
    de&&mand_neq( IP, 0 );

    // Check stacks
    // ToDo: grow them when needed?
    de&&mand( TOS < ACTOR_data_stack_limit );
    de&&mand( TOS >= ACTOR_data_stack );

    verbose_stack_de&&bug( S()
      + "Eval. Before immediate run of " + tag_as_text( tag )
      + " at IP " + C( IP )
      + "\n" + stacks_dump()
    );

    // ToDo: try{ ... } and "back-to-outer-interpreter" primitive
    run();

    de&&mand( TOS < ACTOR_data_stack_limit );
    de&&mand( TOS >= ACTOR_data_stack );
    verbose_stack_de&&bug( S()
      + "\nEval. After immediate run of "
      + tag_as_text( tag )
      + "\n" + stacks_dump()
    );

  // When adding to the definition of a new verb or block
  }else{

     eval_de&&bug( S()
      + "Eval. do_machine_code, compile "
      + N( tag ) + " #" + tag_as_text( tag )
      + "# into definition of " + parse_new_verb_name
    );

    add_machine_code( tag );
  }

}


/*
 *  compile-quote - avoid executing the next token, just compile it
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
 *  compile-block-begin - Start the definition of a new block
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

  if( tsome( verb ) ){
    parse_enter( parse_call_block, verb );
  }else{
    parse_enter( parse_block, no_text );
  }

  eval_do_machine_code( tag_block );

  // Reserve one verb for block's length, like for verb definitions
  parse_block_start = stack_length( parse_codes );
  parse_block_scoped = 0;
  set( the_tmp_cell, type_integer, tag_block_header, 0 );
  stack_push_copy( parse_codes, the_tmp_cell );

}


function primitive_compile_block_begin(){
  eval_block_begin( pop_as_text() );
}
primitive( "compile-block-begin", primitive_compile_block_begin );


/*
 *  compile-block-end - Close the definition of a new block
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


function operand__X_( v : ConstText ) : Text {
// remove firts two characters and last character
  return tmid( v, 2, -1 );
}


function operandX_( v : ConstText ) : Text {
// remove last character
  return tcut( v, -1 );
}


/*
 *  Special verbs are verbs whose names are special.
 *  . , ; ( ) { and } are special verbs.
 *  verbs starting with . / # > or _ are usually special.
 *  verbs ending with : / # > _ ( or { are usually special.
 *  There are exceptions. Single character verbs are usually not special.
 *  What is special about special verbs is that they have special meanings
 *  understood by the compiler.
 *  Note: , is a very special character, it always behaves as a space.
 */

function token_is_special_verb() : boolean {

  const token_length = tlen( token_text );

  // ToDo: parsing verbs should be immediate verb, not special tokens
  if( ( token_length == 1 )
  && ( tidx( ".,;(){}", token_text ) >= 0 ) ){
    return true;
  }

  // Special verbs are at least 2 characters long
  if( token_length < 2 )return false;

  // .xxx is for member access, either .xxx> or .>xxx, ie read or write
  // @xxx is for :it memmber access, either @xxx or @xxx!, ie read or write
  // :xxx is for naming
  // /xxx is for tags, #xxx too
  // #xx# is for verb literals
  // ##xx# is for primitive literals
  // $xxx is for read access to local variables, xxx> too
  // >xxx is for write access to local variables
  // _xxx is for read access to data variables
  if( tidx( ".@:/#>_$", token_first_ch ) >= 0 )return true;

  // xxx/ is for tags
  // xxx> is for read access to local variables
  // xxx: is for keywords
  // xxx( is for calls
  // xxx{ is for block calls
  // xxx" is for smart text
  // xxx[ is for smart aggreagates, like lists, maps, etc
  if( tidx( "/>_:({\"[", token_last_ch ) >= 0 )return true;

  return false;

}


/*
 *  eval - run source code coming from the default input stream
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
 *  eval - evaluate some source code
 */

function eval_special_form() : boolean {

  if( token_length < 2 )return false;

  const first_ch  = token_first_ch;
  const second_ch = tmid( token_text, 1, 2 );
  const last_ch   = token_last_ch;

    // @xx!, it is a lookup in the :it object with write
  if( teq( first_ch,  "@" )
  &&  teq( last_ch, "!" )
  && token_length > 2
  ){
    eval_do_machine_code( tag_it );
    eval_do_tag_literal( operand_X_( token_text ) );
    eval_do_machine_code( tag_object_set );
    return true;
  }

  // @xxx, it is a lookup in the :it object with fetch
  if( teq(  first_ch, "@" )
  &&  tneq( last_ch,  "!" )
  ){
    eval_do_machine_code( tag_it );
    eval_do_tag_literal( operand_X( token_text ) );
    eval_do_machine_code( tag_object_at );
    return true;
  }

  // .>xx!, to set an object property
  // ToDo: .>xxx to push a value into an object
  if( teq( first_ch,  "." )
  &&  teq( second_ch, ">" )
  &&  teq( last_ch,   "!" )
  &&  token_length > 3
  ){
    eval_do_tag_literal( operand__X_( token_text ) );
    eval_do_machine_code( tag_object_set );
    return true;
  }

  // .$xxx, it is a lookup in an object with fetch
  if( teq( first_ch,  "." )
  &&  teq( second_ch, "$" )
  && token_length > 2
  ){
    eval_do_tag_literal( operand__X( token_text ) );
    eval_do_machine_code( tag_object_at );
    return true;
  }

  // .xxx>, it is a lookup in an object with fetch
  if( teq( first_ch, "." )
  &&  teq( last_ch,  ">" )
  && token_length > 2
  ){
    eval_do_tag_literal( operand_X_( token_text ) );
    eval_do_machine_code( tag_object_at );
    return true;
  }

  // .xxx, it is a method call
  if( teq(  first_ch, "." )
  &&  tneq( last_ch,  ">" )
  ){
    eval_do_tag_literal( operand_X( token_text ) );
    eval_do_machine_code( tag_run_method );
    return true;
  }

  // if ##xx# then it is a primitive literal
  if( teq( first_ch,  "#" )
  &&  teq( second_ch, "#" )
  &&  teq( last_ch,   "#" )
  &&  token_length > 3
  ){
    eval_do_primitive_literal( operand__X_( token_text ) );
    return true;
  }

  // if #xx# then it is a verb literal
  if( teq( first_ch, "#" )
  &&  teq( last_ch,  "#" )
  &&  token_length > 2
  ){
    eval_do_verb_literal( operand_X_( token_text ) );
    return true;
  }

  // /xxx or #xxx, it is a tag
  if( teq( first_ch, "/" ) ||  teq( first_ch, "#" ) ){
    eval_do_tag_literal( operand_X( token_text ) );
    return true;
  }

  // >xxx!, it is a lookup in the control stack with store
  if( teq( first_ch, ">" )
  &&  teq( last_ch,  "!" )
  &&  token_length > 2
  ){
    eval_do_tag_literal( operand_X_( token_text ) );
    eval_do_machine_code( tag_set_local );
    return true;
  }

  // >xxx, it is a make in the control stack
  if( teq(  first_ch, ">" )
  &&  tneq( last_ch,  "!" )
  ){
    // Insert a call to primitive_scope if needed
    if( parse_block_scoped == 0 ){
      eval_do_machine_code( tag_scope );
      parse_block_scoped = 1;
    }
    eval_do_tag_literal( operand_X( token_text ) );
    eval_do_machine_code( tag_make_local );
    return true;
  }

  // $xxx, it is also a lookup in the control stack with fetch
  if( teq(  first_ch, "$" )
  &&  tneq( last_ch,  "!" )
  ){
    // ToDo: optimize using cached-local
    eval_do_tag_literal( operand_X( token_text ) );
    eval_do_machine_code( tag_get_local );
    return true;
  }

  // _xxx!, it is a lookup in the data stack with store
  if( teq( first_ch, "_" )
  &&  teq( last_ch,  "!" )
  && token_length > 2
  ){
    eval_do_tag_literal( operand_X_( token_text ) );
    eval_do_machine_code( tag_set_data );
    return true;
  }

  // _xxx, it is a lookup in the data stack with fetch
  if( teq(  first_ch, "_" )
  &&  tneq( last_ch,  "!" )
  ){
    eval_do_tag_literal( operand_X( token_text ) );
    eval_do_machine_code( tag_data );
    return true;
  }

  // :xxx, it is a naming operation, explicit, Forth style compatible
  if( teq( first_ch, ":" ) ){
    // ToDo: optimize the frequent literal /tag rename sequences
    eval_do_tag_literal( operand_X( token_text ) );
    eval_do_machine_code( tag_rename );
    return true;
  }

  // xxx/ it is a tag
  if( teq( last_ch, "/" ) ){
    eval_do_tag_literal( operandX_( token_text ) );
    return true;
  }

  // xxx>, it is a lookup in the control stack with fetch
  if( teq( last_ch, ">" ) ){
    eval_do_tag_literal( operandX_( token_text ) );
    eval_do_machine_code( tag_get_local );
    return true;
  }

  // {xxx}, it is a short block about a verb
  if( teq( first_ch, "{" )
  &&  teq( last_ch,  "}" )
  &&  token_length > 2
  ){
    const auto_ = operand_X_( token_text );
    if( verb_exists( auto_ ) ){
      eval_do_integer_literal( definition_of( tag( auto_ ) ) );
    }else{
      eval_do_tag_literal( token_text );
    }
    return true;
  }

  // It's not so special after all
  return false;
}


const tag_run_at_method = tag( "run-@method" );

/*
 *  run-@method - run an it method on a path described target
 */

function primitive_run_at_method(){

  // The stack holds the target, named :it
  // Then the tags to follow to reach the final target
  const top = TOS;

  // First lookup for the :it value
  let it_ptr = TOS;
  while( true ){
    if( name_of( it_ptr ) == tag_it )break;
    // Check stack limit
    if( stack_de && ( it_ptr == ACTOR_data_stack ) ){
      FATAL( "run-@method-block: no :it found" );
      return;
    }
    it_ptr -= ONE;
  }
  const ntags = top - it_ptr;

  // There should be at least one tag, it is the name of the method
  if( check_de && ntags < 1 ){
    FATAL( "run-@method-block: no method name found" );
    return;
  }

  // Then lookup for the parameters
  const stack_ptr = it_ptr - ONE;
  // Check stack limit
  if( stack_de && ( stack_ptr <= ACTOR_data_stack ) ){
    FATAL( "run-@method-block: no block found" );
    return;
  }

  // Now let's follow the path
  let ii = 1;
  let final_it_ptr = it_ptr;
  let new_ptr;
  let tag;
  while( ii < ntags ){
    tag = eat_tag( it_ptr + ii );
    new_ptr = object_get( final_it_ptr, tag );
    if( new_ptr == 0 ){
      FATAL( "Object variable not found, named " + tag_as_text( tag ) );
      return 0;
    }
    clear( final_it_ptr );
    final_it_ptr = new_ptr;
    ii += 1;
  }

  // Get the name of the method to run
  const method_tag = eat_tag( it_ptr + ii );

  // Schedule the method to run
  run_target_method( final_it_ptr, method_tag );

  // It will have an :it variable
  make_local_it( final_it_ptr );

  // The parameters will be at the top of the stack
  TOS = stack_ptr;

}
primitive( "run-@method", primitive_run_at_method );


function eval_path( path : ConstText ){
  // there are . separated tags, last one is a method call
  let auto_ = path;
  let head = path;
  let tail = 0;
  while( tlen( auto_ ) != 0 ){
    tail = tidx( auto_, "." );
    if( tail == -1 ){
      eval_do_tag_literal( auto_ );
      break;
    }
    head = tcut( auto_, tail );
    auto_ = tbut( tbut( auto_, tail ), 1 );
    eval_do_tag_literal( head );
  }
}


function eval_at_call( path : ConstText ){
  eval_do_machine_code( tag_it );
  eval_path( path );
  eval_do_machine_code( tag_run_at_method );
}


function source_location( l : Index, c : Index ) : Text {
  return " at " + tag_as_text( debug_info_file ) + ":" + N( l ) + ":" + N( c );
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

  // Name of verb for xxx( ... ), xxx{ ... }, xxx[ ... ] and xxx"..." calls
  /**/ let call_verb_name  = "";
  //c/ static Text call_verb_name(   "" );

  let done            = false;
  let is_special_form = false;
  let is_int          = false;
  let is_operator     = false;

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

    // Update globals for debug-info generation
    debug_info_line   = token_line_no;
    debug_info_column = token_column_no;

    if( de && teq( token_text, "token-debugger" ) )debugger;

    // Skip less frequent case when possible, to avoid some useless tests
    if( ! tok_type( token_type_word ) ){

      // ~~ and ~~| ... |~~, skip these comments
      if( tok_type( token_type_comment )
      ||  tok_type( token_comment_multiline )
      ){
        // ToDo: verb for definitions should be normal verbs
      continue;
      }

      // ++ indent has no effect, for now
      if( tok_type( token_type_indentation )
      &&  tok( "++" )
      ){
        continue;
      }

      // error ? exit loop on tokenizer error
      if( tok_type( token_type_error ) ){
        bug( S()
          + "Eval, tokenizer error " + token_text
          + source_location( token_line_no, token_column_no )
        );
        done = true;
        break;
      }

      // eof ? exit loop at end of the input stream
      if( tok_type( token_type_eof ) ){
        // ToDo: signal premature end of file
        if( ! parsing( parse_top_level ) ){
          const auto_file = tag_as_text( current_eval_file );
          // ToDo: display unfinished definition
          bug( S()+ "Eval, premature end of file " + auto_file );
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
      &&  token_column_no == 1
      &&  stack_length( parse_codes ) > 0
      &&  ! eval_is_expecting_the_verb_name()
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
    if( tok_match( token_type_indentation, "--" )
    &&  token_column_no == 1
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
      de&&mand( ! eval_is_expecting_the_verb_name() );
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
    if( token_column_no == 1
    &&  tok_match( token_type_indentation, "--" )
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
      && ( ( tok( ";" ) && ! is_forth )
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
        + parse_type_as_text( parse_type )
        + " in definition of " + parse_new_verb_name
        + source_location( parse_line_no, parse_column_no )
      );
      debugger;
      break;
      done = true;
    }

    // From now it is most often either a literal or a verb
    // If compiling a verb, that literal or verb is added to the current verb.

    // "..." ? if text literal
    if( tok_type( token_type_text ) ){
      eval_do_text_literal( token_text );
      continue;
    }

    // If not word token nor indentation then it is an internal error
    if( ! tok_type( token_type_word )
    &&  ! tok_type( token_type_indentation )
    ){
      bug( S()
        + "Eval. Internal error. Invalid token "
        + token_type_as_text( token_type )
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
      copy_cell( tag( token_text ), push() );
      continue;
    }

    if( ! tok_type( token_type_word ) )continue;
    // ToDo: this assert fails, why? de&&mand( tsome( val ) );
    if( tok( no_text ) )continue;

    // OK. It's a word token

    if( verb_exists( token_text ) ){
      // Existing verbs take precedence in all cases
      verb_id = tag( token_text );
      done = true;
    }else{
      // If not a verb, it may be a special form, a literal, etc
      // ToDo: handle integer and float literals here
      is_int = text_is_integer( token_text );
    }

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
    if( ! done && is_forth
    &&  ! tok( ";" )
    &&  ! tok( "{" )
    &&  ! tok( "}" )
    &&  ! is_int
    ){
      if( ! verb_exists( token_text ) ){
        parse_de&&bug( S()+ "Parser. Forth. Undefined verb: " + token_text );
        debugger;
      }else{
        verb_id = tag( token_text );
        done = true;
      }

    // In Inox dialect some verbs are special
    }else if( ! done ){

      is_special_form = ! is_int && token_is_special_verb();

      if( ! is_special_form && ! is_int ){
        if( ! verb_exists( token_text ) ){
          if( parse_de || warn_de ){
            trace( S()
              + "Parser. Undefined verb: " + token_text
              + source_location( token_line_no, token_column_no )
            );
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

      is_operator = ! is_forth && !! is_operator_verb( verb_id );

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
        if( parsing( parse_keyword ) && teq( token_last_ch, ":" ) ){
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
    if( verb_id != 0 && ! is_operator && tneq( token_last_ch, "{" ) ){
      eval_do_machine_code( verb_id );
      continue;
    }

    de&&mand(
      tok_type( token_type_word ) || tok_type( token_type_indentation )
    );

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
    if( ! done && teq( token_last_ch, ":" ) ){

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

        // If start of .xxx: aaa yyy: bbb ;
        if( teq( tat( token_text, 0 ), "." ) ){
          // Save target into control stack
          eval_do_machine_code( tag_to_control );
        }
      }
      continue;
    }

    // ( of xxx(  or ( of ( sub expression )
    if( ! done && teq( token_last_ch, "(" ) ){

      // if ( of ( expr )
      if( token_length == 1 ){
        parse_enter( parse_subexpr, no_text );

      // if ( of xxx(, but not ((
      }else if( tneq( token_text, "((" ) ){
        parse_enter( parse_call, operandX_( token_text ) );

        // If .xx(
        if( teq( tat( token_text, 0 ), "." ) ){
          // Save target into control stack
          eval_do_machine_code( tag_to_control );
        }
      }
      done = true;

    // { of xxx{ or { of { block }
    }else if( teq( token_last_ch, "{" ) ){

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
          eval_block_begin( token_text );

          // If .xxx{
          if( teq( tat( token_text, 0 ), "." ) ){
            // Save target into control stack
            eval_do_machine_code( tag_to_control );
          }

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
    }else if( ! done && teq( token_last_ch, "}" ) ){

      if( parsing( parse_call_block ) ||  parsing( parse_block ) ){

        // If end of a xxx{
        if( parsing( parse_call_block ) ){
          call_verb_name = parse_name;
          eval_block_end();

          // If end of .xxx{ call
          if( tlen( call_verb_name ) > 1
          &&  teq( tat( call_verb_name, 0 ), "." ) // ToDo: first_ch?
          ){
            // Restore target object
            eval_do_machine_code( tag_from_control );
            eval_do_tag_literal( operand_X( call_verb_name ) );
            eval_do_machine_code( tag_run_method_by_name );

          // If @xx.yy.zz{ call
          } else if( tlen( call_verb_name ) > 1
          &&  teq(
            /**/ call_verb_name[0],
            //c/ call_verb_name.at( 0 ),
             "@"
            ) // ToDo: first_ch?
          ){
            eval_at_call( operand_X( call_verb_name ) );

          // If xxx{ call
          }else{
            if( verb_exists( call_verb_name ) ){

              // If .xxx{ call
              if( teq( tat( call_verb_name, 0 ), "." ) ){
                // Swap target and block
                eval_do_machine_code( tag_swap );
              }

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

      // Premature/unexpected }
      }else{
        trace( S()
          + "Parser. Nesting warning, unexpected } "
          + source_location( token_line_no, token_column_no )
          + ", while expecting the end of "
          + parse_type_as_text( parse_type )
        );
        done = true;
      }

      done = true;

    // ) end of a ( sub expression ) or end of xxx( function call
    }else if( ! done && teq( token_first_ch, ")" ) ){

      if( parsing( parse_subexpr ) ||  parsing( parse_call ) ){

        if( parsing( parse_call ) ){

          call_verb_name = parse_name;

          // If ) of .xxx( )
          if( tlen( call_verb_name ) > 1
          &&  teq( tat( call_verb_name, 0 ), "." )
          ){
            // ToDo: what would be the meaning of .( xxxx ) ?
            // It could call some xxxx.call method of the target object
            // popped from the data stack. This would be convenient
            // for verb value and some block, function, callable, etc, objects.
            // Restore target from control stack
            eval_do_machine_code( tag_from_control );
            eval_do_tag_literal( operand_X( call_verb_name ) );
            eval_do_machine_code( tag_run_method_by_name );

          // If ) of @xx.yy.zz( call
          } else if( tlen( call_verb_name ) > 1
          &&  teq(
            /**/ call_verb_name[0],
            //c/ call_verb_name.at( 0 ),
             "@"
            ) // ToDo: first_ch?
          ){
            eval_at_call( operand_X( call_verb_name ) );

          // ) of xxx( )
          }else{
            verb_id = tag( call_verb_name );
            // ToDo: update stack, ie parse_level.verb = verb_id;
            parse_verb = verb_id;
            if( verb_exists( call_verb_name ) ){
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

        parse_leave();

      // Premature/unexpected )
      }else{
        bug( S()
          + "Parser. Nesting warning, unexpected ) "
          + source_location( token_line_no, token_column_no )
          + ", while expecting the end of "
          + parse_type_as_text( parse_type )
        );
      }
      done = true;

    // ; (or .) marks the end of the keyword method call, if any
    }else if( ! done
    && ( tok( ";" )
      || tok( end_define ) )
    && parsing( parse_keyword )
    // ToDo: }, ) and ] should also do that
    ){

      while( parsing( parse_keyword ) ){

        // .xx: ... yy: ... ; keyword method call
        if( teq( tat( parse_name, 0 ), "." ) ){
          // Restore target from control stack
          eval_do_machine_code( tag_from_control )
          eval_do_tag_literal( tcut( parse_name, 1 ) );
          eval_do_machine_code( tag_run_method );

        // not a keyword method call
        }else{

          // If not multipart, remove trailing :
          if( tidx( parse_name, ":" ) == tlen( parse_name ) - 1 ){
            // ToDo: update stack, ie parse_level.name = tcut( parse_level_name, -1 );
            parse_name = tcut( parse_name, -1 );
          }

          // If verb does not exist, use missing-verb instead
          if( ! verb_exists( parse_name ) ){
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

    }else if( ! done && is_special_form && eval_special_form() ){
      done = true;
    }

    // If not done with special verbs, handle integers and undefined verbs
    if( ! done ){
      if( is_int ){
        eval_do_integer_literal( integer_from_text( token_text) );
      }else if( teq( token_first_ch, "-" )
      && text_is_integer( tcut( token_text, 1 ) )
      ){
        eval_do_integer_literal(
          - integer_from_text( tcut( token_text, 1 ) )
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
  de&&mand_eq( stack_length( parse_stack ), parse_state_length );
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
  const auto_ = cell_as_text( TOS );
  if( trace_capture_enabled ){
    trace_capture_buffer += auto_;
  }
  // ToDo: output to stdout when running on POSIX systems
  trace( S()+ "\nTRACE " + auto_ );
}
primitive( "trace", primitive_trace );


/*
 *  inox-out - output text to the default output stream
 */

function primitive_inox_out(){
  primitive_trace();
  drop();
}
primitive( "inox-out", primitive_inox_out );


/*
 *  trace-stacks - dump user friendly stacks trace
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
  }*/
  set_text_cell( TOS, ch );
  set_tos_name( tag_ascii );
}
primitive( "ascii-character", primitive_ascii_character );


/*
 *  ascii-code - return ascii code of first character of TOS as text
 */

function primitive_ascii_code(){
  /**/ const code = cell_as_text( TOS ).charCodeAt( 0 );
  //c/ int code = cell_as_text( TOS ).at( 0 );
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
 *  instructions - number of instructions executed so far
 */

const tag_instructions = tag( "instructions" );

function primitive_instructions(){
  push_integer( instructions_total );
  set_tos_name( tag_instructions );
}
primitive( "instructions", primitive_instructions );


/*
 *  the-void - push the void, typed void, named void, valued 0
 */

function primitive_the_void(){
  push();
}
primitive( "the-void", primitive_the_void );


/*
 *  _ - synonym for the-void, push the void, typed void, named void, valued 0
 */

function primitive_(){
  push();
}
primitive( "_", primitive_ );


/* -----------------------------------------------------------------------------
 *  HTTP interface to the outside world.
 *  Basic level of support for HTTP requests and responses.
 *
 *  What is needed:
 *
 *  - a way to send a request to a server
 *  This means a way to send a request line, a way to send headers, and a way
 *  to send the body of the request.
 *
 *  - a way to receive a response from a server
 *  This means a way to receive a response line, a way to receive headers, and
 *  a way to receive the body of the response.
 *
 *  - a way to send a response to a client
 *  This means a way to send a response line, a way to send headers, and a way
 *  to send the body of the response.
 *
 *  - a way to receive a request from a client
 *  This means a way to receive a request line, a way to receive headers, and
 *  a way to receive the body of the request.
 *
 *  How this is done in a web browser:
 *  - a way to send a request to a server
 *  JavaScript has a way to send a request to a server, it is called fetch().
 *  It is asynchronous, it returns a promise, and the promise is resolved when
 *  the response is received.
 * - a way to receive a response from a server
 *  The response is received by the fetch() function, and the promise is
 *  resolved when the response is received.
 *
 *  How this is done in a web server:
 *  - a way to send a response to a client
 *  The server has a way to send a response to a client, it is called
 *  sendResponse().
 *  - a way to receive a request from a client
 *  The server has a way to receive a request from a client, it is called
 *  receiveRequest().
 *  Both sendResponse() and receiveRequest() are synchronous.
 *  The server is multi-threaded, so it can wait for a request without
 *  blocking the other threads.
 *  The server is multi-threaded, so it can send a response without blocking
 *  the other threads.
 *
 *  How this is done in the Deno web server:
 *  - a way to send a response to a client
 *  The server has a way to send a response to a client, it is called
 *  req.respond().
 *  - a way to receive a request from a client
 *  The server has a way to receive a request from a client, it is called
 *  for await (const req of server) { ... }.
 *  Both req.respond() and for await (const req of server) { ... } are
 *  asynchronous.
 *  The server is single-threaded, so it cannot wait for a request without
 *  blocking the other requests.
 *  The server is single-threaded, so it cannot send a response without
 *  blocking the other requests.
 *
 *  In all cases, there seem to be a request and a response object.
 *  The request object is used to send a request or to receive a request.
 *  The response object is used to send a response or to receive a response.
 *
 *  Attributes of the request object:
 *  - the request line
 *  - the request headers
 *  - the request body
 *  - the request method
 *  - the request URL
 *  - the request version
 *  - the request scheme
 *  - the request host
 *  - the request port
 *  - the request path
 *  - the request query
 *  - the request fragment
 *  - the request username
 *  - the request password
 *  - the request origin
 *  - the request referer
 *  - the request user-agent
 *  - the request accept
 *  - the request accept-encoding
 *  - the request accept-language
 *  - the request accept-charset
 *  - the request content-type
 *  - the request content-length
 *  - the request content-encoding
 *  - the request content-language
 *  - the request content-charset
 *  - the request content-location
 *  - the request content-range
 *  - the request content-disposition
 *  - the request content-transfer-encoding
 *  - the request content-security-policy
 *  - the request content-encoding
 *  - the request content-language
 *  - the request content-charset
 *  - the request content-location
 *  - the request content-range
 *  - the request content-disposition
 *  - the request content-transfer-encoding
 *  - the request content-security-policy
 *  See also https://developer.mozilla.org/en-US/docs/Web/API/Request
 *
 *  Attributes of the response object:
 *  - the response line
 *  - the response headers
 *  - the response body
 *  - the response version
 *  - the response status
 *  - the response reason
 *  - the response content-type
 *  - the response content-length
 *  - the response content-encoding
 *  - the response content-language
 *  - the response content-charset
 *  - the response content-location
 *  - the response content-range
 *  - the response content-disposition
 *  - the response content-transfer-encoding
 *  - the response content-security-policy
 *  - the response content-encoding
 *  - the response content-language
 *  - the response content-charset
 *  - the response content-location
 *  - the response content-range
 *  - the response content-disposition
 *  - the response content-transfer-encoding
 *  - the response content-security-policy
 *  - the response access-control-allow-origin
 *  - the response access-control-allow-credentials
 *  - the response access-control-allow-methods
 *  - the response access-control-allow-headers
 *  - the response access-control-max-age
 *  - the response access-control-expose-headers
 *  - the response access-control-request-method
 *  - the response access-control-request-headers
 *  - the response access-control-allow-methods
 *  - the response access-control-allow-headers
 *  See also https://developer.mozilla.org/en-US/docs/Web/API/Response
 *
 *  The implementation is based on promises. Let's see how it works.
 *  The request object is a promise that is resolved when the request is
 *  received.
 *  The response object is a promise that is resolved when the response is
 *  received.
 *
 *  To implement all of this I will build on the previous work I did in
 *  the version 8 of the LinkOS kernel.
 *  It is a kernel that is written in Javascript. The githbu repository is
 *  here: https://github.com/virteal/l8
 *
 *  So, here is... the LinkOS kernel version 9! Or L9 for short. Most of
 *  the code is written in Inox but some low level primitives are defined
 *  here. See the file l9.nox for the Inox code.
 */


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
//c/ static MemoryVisitFunction memory_visit_function = null;

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
  const auto_ = dump( c );
  if( sz <= size_of_cell ){
    trace( S()+ C( c ) + " " + tag_as_dump_text( tag ) + " " + auto_ );
    return false;
  }
  const ncells = sz / size_of_cell;
  trace( S()+
    C( c ) + " /" + tag_as_dump_text( tag )
    + " [" + N( ncells ) + "] " + auto_
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
  /**/ let  new_state = JSON.stringify( cell_as_text( TOS ) );
  //c/ Text new_state = cell_as_text( TOS );

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
  POP: pop,
  PUSH: push,
  RUN: run,
  type: type_of,
  name: name_of,
  value: value_of,
  tag,
  copy_cell,
  move_cell,
  clear_cell: clear,
  cell_as_text,
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
 *  Bootstraping and smoke test
 */

/*ts{*/

const I   = inox();
const Fun = I.fun;

/*}*/

function eval_file( name : TxtC ){

  current_eval_file = tag( name );
  debug_info_file   = tag( name );

  /*ts{*/
    const source_code = require( "fs" ).readFileSync( "lib/" + name, "utf8" );
    current_eval_content = source_code;
    I.processor( "{}", "{}", source_code );
  /*}*/

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
    current_eval_content = source_code;
    processor( "{}", "{}", source_code );
  }*/
}


/*
 *  source - evaluate the content of a file
 *  ToDo: should handle various types of input stream, not just files
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
  /**/ try{
  eval_file( "bootstrap.nox" );
  eval_file( "forth.nox" );
  eval_file( "l9.nox" );
  if( de ){
    eval_file( "test/smoke.nox" );
    // primitive_memory_visit();
  }
  /**/ }catch( e ){ breakpoint(); throw e; }
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

  forget_parameters_definition = definition_of( tag_forget_parameters );
  until_checker_definition     = definition_of( tag_until_checker );
  while_checker_definition     = definition_of( tag_while_checker );
  forget_it_definition         = definition_of( tag_forget_it );
  assert_checker_definition    = definition_of( tag_assert_checker );
  forget_locals_definition     = definition_of( tag_forget_locals );
  destructor_definition        = definition_of( tag_destructor );
  scope_close_definition       = definition_of( tag_scope_close );
  run_definition               = definition_of( tag_run );
  run_super_method_definition  = definition_of( tag_run_super_method );
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

  function primitive_repl_dot(){
    process.stdout.write( Fun.pop_as_text() );
  }
  I.primitive( "repl-out", primitive_repl_dot );


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
    if( ! line ){
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
