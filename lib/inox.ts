/* inox.js
 *   Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
 * minimalist concatenative functional dynamic programming language.
 *
 * june 3 2021 by jhr
 * june 7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 * june 10 2021 by jhr, .nox file extension
 */

import { assert } from "console";

function inox(
  json_state : string,
  json_event : string,
  source     : string
) : string {

// Starts running an Inox machine, returns a json encoded new state.
// ToDo: return diff instead of new state
// The source parameter is a string, maybe the content of a .nox text file.

// Inox targets the webassembly virtual machine but runs on other
// architectures too.
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
// String        - like in javascript, immutable, not 0 terminated like in C
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
// programming style, maybe using some freezing mechanism.
//
// This is the reference implementation. It defines the syntax and semantic
// of the language. Production quality version of the virtual machine would
// have to be hard coded in some machine code to be efficient.


//## dialect-typescript;
// This compilation directive tells the Inox compiler to switch to javascript
// ToDo: implement that dialect and make sure this current file complies to it.
// The first characters of a file define the syntax for comments.
// Anything before a whitespace is a "start of comment", if it is longer than
// one character then it its the start of of a "multi line comment" with the
// the end of comment being the same characters except for the first one that
// becomes the ending characters. That works for /* and */ and other syntaxes.
// Characters after the first multi line comment define the one line comment.


de&&bug( "Inox starting..." );

// my de&&bug darling
function bug( msg: string ){
  console.log( msg );
}
var de : boolean = true;


assert( de ); // Not ready for production

// Make it work in the javascript machine
// ToDo: it's broken
const PORTABLE = true;

// ToDo: if( PORTABLE ){

require( "assemblyscript/std/portable" );

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
type i8    = number;
type u8    = number;
type i16   = number;
type u16   = number;
type i32   = number;
type u32   = number;
type isize = number;
type usize = number;
type u64   = number;

type InoxAddress = u32; // Abritrary address in memory
type InoxCode    = u16; // Index in either builtins or words dictionaries
type InoxValue   = u32; // payload

// Portable versions of load() and store()
let memory = new Uint32Array( 1024 * 16 );

function load32( index : InoxAddress ) : u32 {
  return memory[ index << 2 ];
}

function store32( index : InoxAddress, value : InoxValue ) : void {
   memory[ index << 2 ] = value;
}

function load16( index : InoxAddress ) : u16 {
  let word : u32 = memory[ index << 2 ];
  // ToDo: big/little endian stuff
  if( ( index & 2 ) == 2 ){
    return word >> 16;
  }else{
    return word & 0xffff;
  }
}

function store16( index : InoxAddress, value : u16 ) : void {
  let word: u32 = memory[ index << 2 ] = value;
  if( ( index & 2 ) == 2 ){
    word = ( word & 0xffff ) | ( value << 16 );
  }else{
    word = ( word & 0xffff0000 ) | value;
  }
  memory[ index << 2 ] = word;
}

// Not portable version is AssemblyScript syntax
// }
if( ! PORTABLE ){ /*

@inline function load32( index : InoxAddress ) : u32 {
  return load< u32 >( index );
}

@inline function store32( index : InoxAddress, value : InoxValue ) : void {
  store< InoxValue >( index, value );
}

@inline function load16( index : InoxAddress ) : u16 {
  return load< u16 >( index );
}

@inline function store16( index : InoxAddress, value : u16 ) : void {
  store< u16 >( index, value );
}

*/} // ! PORTABLE?


// ToDo: restore state and provide event from json encoded values
let state = JSON.parse( json_state );
let event = JSON.parse( json_event );

const _ = 0; // undefined;

// -----------------------------------------------------------------------
//  Cell
//
// A memory cell has an address, a type, a value and a name maybe.
// When the type is "list", the name is address of the rest of the list.
// The encoding stores all of that in a 64 bits word.
// cell.type is a numeric id, 0..7
// cell.name is the address a Symbol type of cell (xor next in list).
// cell.value depends on type, often a pointer.
//
// eqv C like struct Cell {
//  value : InoxValue; // 32 bits word
//  info  : InoxInfo;  // packed type & name
// };
//
// Possible layouts :
//  32 bits values, 3 bits types, 29 bits addresses, 4 bytes per cell
//  40 bits values, 3 bits types, 25 bits addresses, 5 bytes per cell
//  48 bits values, 3 bits types, 15 bits addresses, 6 bytes per cell
//  16 bits values, 3 bits types, 13 bits addresses, 32 bits cells, 8kb
//  The layout could also vary according to the type.

type  Cell         = u32; // Pointer to cell, aligned on 64 bits boundaries
type  InoxInfo     = u32; // followed by type & name info
type  InoxType     = u8;  // packed with name, 4 bits, 16 types
type  InoxName     = u32; // 29 bits actually, type + info is 32 bits
const size_of_cell = 8;   // 64 bits

// In memory, the value is stored first, then the type & name info
const offset_of_cell_info = 4;

abstract class CellContent {
// A memory cell has an address, a type, a value and a name maybe.
// When the type is "list", the name is the address of the rest of the list.
// The encoding stores all of that in a 64 bits word.
// Derived classes defines additional methods.

    type  : InoxType;  // 0..7
    name  : Cell;      // address of some other memory cell
    value : InoxValue; // value depends on type, often a pointer to an object

    constructor( cell : Cell ){
      let info : InoxInfo = fetch_info( cell );
      this.type  = unpack_type( info );
      this.name  = unpack_name( info );
      this.value = fetch_value( cell );
    }

}

// cell number 0 is reserved, special, 0/0/0, void/void/void
let first_cell = 0;
if( ! PORTABLE ){/*
  first_cell = heap.alloc( 1024 ); // Some initial memory, expanded later
*/}
let next_cell : InoxAddress = first_cell + size_of_cell;

function allocate_cell() : Cell {
  let top = next_cell;
  next_cell += size_of_cell;
  return top;
}

function allocate_bytes( size : InoxValue ) : InoxAddress {
  // Align on 64 bits
  var aligned_size = ( size + 7 ) >> 3;
  var top = next_cell;
  next_cell += aligned_size;
  return top;
}

// @inline
function store( address : InoxAddress, value : InoxAddress ) : void {
  store32( address, value );
}

// @inline
function fetch( address : InoxAddress ) : InoxAddress {
  return load32( address );
}

// @inline
function store_value( address : Cell, value : InoxValue ) : void {
  store32( address, value );
}

// @inline
function fetch_value( address : Cell ) : InoxValue {
  return load32( address );
}

// @inline
function store_info( address : Cell, value : InoxInfo ) : void {
  store32( address + offset_of_cell_info, value,  );
}

// @inline
function fetch_info( address : Cell ) : InoxAddress {
  return load32( address + offset_of_cell_info );
}

// @inline
function pack( type : InoxType, name : InoxName ) : InoxInfo {
// Pack type and name together.
  // Name is a 64 bits aligned pointer to a symbol type of cell
  return name | type;
}

// @inline
function unpack_type( value : InoxValue ) : InoxType {
  return value & 0x7; // 3 bits
}

// @inline
function unpack_name( value : InoxValue ) : InoxName {
  return value & 0xfffffff8;
}

function make_cell(
  type : InoxType, name : InoxName, value : InoxValue
) : Cell {
  let address:InoxAddress = allocate_cell();
  store_cell( address, type, name, value );
  return address;
}

function store_cell(
  address : Cell, type : InoxType, value : InoxValue, name : InoxName
) : void {
  // Store value first
  store32( address, value );
  // Pack type and name together
  store32( address + offset_of_cell_info, pack( type, name ) );
}

function fetch_cell( address : Cell ) : CellContent {
  let info  = fetch_info(  address );
  let value = fetch_value( address )
  // Unpack type and name
  return {
    type:  unpack_type( info ),
    name:  unpack_name( info ),
    value: value
  };
}

function get_cell_type( cell : Cell ) : InoxType {
// Returns the type of a cell
  return unpack_type( fetch_info( cell ) );
}

function get_cell_name( cell : Cell ) : InoxName {
// Returns the name of a cell, as a Symbol id
  return unpack_name( fetch_info( cell ) );
}

// @inline
function get_next_cell( cell : Cell ) : Cell {
// Assuming cell is a list member, return next cell in list
  return unpack_name( fetch_info( cell ) );
}

function set_next_cell( cell : Cell, address : Cell ) : void {
// Assuming cell is a list member, set the next cell in list
  // ToDo: assume type is 0 maybe?
  let info = fetch_info( cell );
  let type = unpack_type( info );
  store_info( cell, pack( type, address ) );
}

function copy_cell( source : Cell, destination : Cell ) : void {
// Change the content of a cell
  store_value( destination, fetch_value( source ) );
  store_info(  destination, fetch_info(  source ) );
}

function copy_cell_value( source : Cell, destination : Cell ) : void {
// Change the content of a cell but keep the previous name
  let destination_name = unpack_name( fetch_info( destination ) );
  let source_type      = unpack_type( fetch_info( source ) );
  let source_value     = fetch_value( source );
  store_info( destination, pack( source_type, destination_name ) );
  store_value( destination, source_value );
}

// This is initialy the sentinel tail of reallocatable cells
let nil_cell   : Cell = allocate_cell();
var free_cells : Cell = nil_cell;

function fast_allocate_cell(
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
){
// Allocate a new cell or reuse an free one
  if( free_cells == nil_cell )return make_cell( type, name, value );
  let address = free_cells;
  let cell = get_next_cell( free_cells );
  free_cells =  cell;
  store_cell( address, type, name, value );
  return cell;
}

function free_cell( address : Cell ){
// free a cell, add it to the free list
  set_next_cell( address, free_cells );
  free_cells = address;
}


// -----------------------------------------------------------------------
//  Symbol & Void, type 1 & type 0
//
// Symbols have an id, it is an integer. Whenever the value of a symbol
// is required as a number, that id is used. Whenever it is the string
// representation that is required, it's the name of the symbol that
// is used.
//   0 is both void and false
//   1 is true, it's symbolic!

const type_symbol = "true";
const all_symbols        = new Map< string, InoxAddress >();
const all_symbols_by_id  = new Map< u32, InoxAddress >();
const symbol_names_by_id = new Map< u32, string >()

let next_symbol_id : u32 = 0;

function make_symbol( name : string ) : InoxName {

  if( all_symbols.has( name ) ){
    return all_symbols.get( name );
  }

  let id = next_symbol_id++;
  let symbol = make_cell( 1, id, id );
  all_symbols.set( name, symbol );
  all_symbols_by_id.set( id, symbol );
  symbol_names_by_id.set( id, name );
  return id;

}

// Symbol with id 0 is void
const type_void   = "void";
const void_cell   = make_cell( 0, 0, 0 ); // First cell ever
const symbol_void = make_symbol( type_void );

// Symbol with id 1 is Symbol
const symbol_symbol = make_symbol( type_symbol );

function symbol_id_to_string( id : u32 ){
  return symbol_names_by_id.get( id );
}

function get_symbol_by_id( id : u32 ) : Cell {
// Return the address of the cell that holds the symbol singleton
  return all_symbols_by_id.get( id );
}


// -----------------------------------------------------------------------
//  String, type 2
//

type ObjectId = u32;
let all_objects_by_id = new Map< ObjectId, any >();
var next_object_id = 1;

function make_basic_object( object : any ) : ObjectId {
  // ToDo: reuse freed object
  // ToDo: return object directly, it fits inside a cell's 32 bits value
  let id = next_object_id++;
  all_objects_by_id.set( id, object );
  return id;
}

function get_basic_object( id : ObjectId ){
  return all_objects_by_id.get( id );
}

function object_id_to_string( id : ObjectId ) : string {
  let obj : any =get_basic_object( id );
  return obj.toString();
}

function free_object( id : ObjectId ){
  // ToDo: list of free objects to reallocate
}

const type_string = "String";
const symbol_string = make_symbol( type_string );

function make_string( value : string ) : Cell {
  return make_cell( 2, symbol_string, make_basic_object( value ) );
}


// -----------------------------------------------------------------------
//  Integer, type 3, 32 bits
// ToDo: u8+ style to deal with less common arrays of bits.

const type_integer = "Integer";
const symbol_integer = make_symbol( type_integer );

function make_integer( value ){
  return make_cell( 3, symbol_integer, value );
}


// -----------------------------------------------------------------------
//  Object, type 4
//

const type_object = "Object";
const symbol_object = make_symbol( type_object );

function make_object( object : Object ) : Cell {
  let symbol = make_symbol( object.constructor.name );
  return make_cell( 4, symbol , make_basic_object( object ));
}

const type_float = "Float";
const symbol_float = make_symbol( type_float );

function make_float( value ){
  return make_cell( 4, symbol_float, make_basic_object( value ) );
}

const type_array = "Array";
const symbol_array = make_symbol( type_array );

function make_array():Cell {
  let array = new Array< any >();
  return make_cell( 4, symbol_array, make_basic_object( array ) );
}

const type_map = "Map";
const symbol_map = make_symbol( type_map );

function make_map(){
  let map = new Map< ObjectId, any >();
  return make_cell( 4, symbol_array, make_basic_object( map ) );
}

const type_list = "List";
const symbol_list = make_symbol( type_list );

function make_list(){
  // ToDo: value should a linked list of cells
  let list = new Array< any >();
  return make_cell( 4, symbol_list, make_basic_object( list ) );
}


// -----------------------------------------------------------------------
//  Function, type 5
// ToDo: unify with Word type

const type_function = "Function";
const symbol_function = make_symbol( type_function );

function make_function( object : Function ) : Cell {
  let symbol = make_symbol( object.name );
  return make_cell( 5, make_basic_object( object ), symbol );
}


// -----------------------------------------------------------------------
//  Act, type 6
//  An Act is created for functions with local variables, aka closures.
//  In addition to normal cells, there is a reference counter.
//  The value of the cell is either void or an array of cells, one for
//  each local variable encapsulated in the closure.
// ToDo: unify with Function and Word types.


const type_act = "Act";
const symbol_act = make_symbol( type_act );

type RefCount = u32;

 class Act {
  filler   : InoxAddress;  // type and name, packed
  locals   : Cell;         // = make_map() or void if none
  refcount : RefCount;     // free when no more references
}

function make_act( caller : Cell ) : Cell {
  let address = allocate_bytes( size_of_cell + 4 );
  store_info( address, pack( 6, fetch_info( caller ) ) );
  // No local variables initially
  store_value( address, void_cell );
  // Store reference counter
  store32( address + 8, 1 );
  return address;
}

function get_act_refcount( address : InoxAddress ) : RefCount {
  return fetch( address + 8 );
}

function set_act_refcount(
  address : InoxAddress,
  count   : InoxValue
) : void {
  store_value( address, count );
}

var free_acts = void_cell;

function allocate_act( caller : Cell ) : Cell {
  if( free_acts == void_cell )return make_act( caller );
  let act = free_acts;
  free_acts = get_next_cell( act );
  store_info( act, pack( 6, fetch_info( caller ) ) );
  return act;
}

function free_act( act : Cell ) : void {
  set_next_cell( act, free_acts );
  free_acts = act;
}

function ref_act( act : Cell ) : void {
  set_act_refcount( act, get_act_refcount( act ) + 1 );
}

function deref_act( act : Cell ) : void {
  var count = get_act_refcount( act );
  count--;
  if( count == 0 ){
    free_act( act );
  }
}


// -----------------------------------------------------------------------
//  Word, type 7
//    the name is the id of the name of the word
//    the value is the address where the word is defined

const type_word = "Word";
const symbol_word = make_symbol( type_word );

let next_word_id = 1;
let all_words_by_id      = new Map< InoxValue, InoxAddress >();
let all_word_ids_by_name = new Map< string, InoxValue >()

function make_word( cell : Cell ) : Cell {
  let id = next_word_id++;
  let name = unpack_name( fetch_info( cell ) );
  let safe_cell: Cell = make_cell( 7, name, fetch_value( cell ) );
  all_words_by_id.set( id, safe_cell );
  all_word_ids_by_name.set( symbol_id_to_string( name ), id );
  return safe_cell;
}

function get_word_by_id( id : InoxValue ) : InoxAddress {
  return all_words_by_id.get( id );
}

function word_name_to_string( id : InoxValue ): string {
  let word_cell = get_word_by_id( id );
  let name = get_cell_name( word_cell );
  let str_name : string = symbol_id_to_string( fetch_value( name ) );
  return str_name;
}

function get_word_definition( name : string ) : InoxAddress {
  let id = all_word_ids_by_name.get( name );
  let cell : Cell = all_words_by_id.get( id );
  return fetch_value( cell );
}

function get_word_definition_by_id( id : InoxValue  ) : InoxAddress {
  let cell : Cell = all_words_by_id.get( id );
  return fetch_value( cell );
}


// --------------------------------------------------------------------------
//  Task
//

const type_Task   = "Task";
const symbol_Task = make_symbol( type_Task );

// Global state about currently running task
let current_task : Task;
let current_ip   : InoxAddress;
let current_rsp  : InoxAddress;
let current_psp  : InoxAddress;

function push( cell : Cell ){
// Push data on parameter stack
  current_psp -= 4; // size of cell pointer
  store32( current_psp, cell );
}

function pop() : Cell {
// Consume top of parameter stack
  let cell : Cell = load32( current_psp );
  current_psp +=4; // size of cell pointer
  return cell;
}

class CpuContext {
  ip  : InoxAddress;
  rsp : InoxAddress;
  psp : InoxAddress;
  constructor( ip : InoxAddress, rsp : InoxAddress, psp : InoxAddress ){
    this.ip  = ip;
    this.psp = psp;
    this.rsp = rsp;
  }
}

class Task {
// Inox machines run cooperative tasks, actors typically

  cell     : Cell;     // Cell that references this object
  parent   : Cell;     // Parent task
  act      : Cell;     // Current activation record
  ip       : Cell;     // Current interpreter pointer in code
  mp       : Cell;     // Memory pointer, in ram array, goes upward
  psp      : Cell;     // Parameter stack pointer, goes downward
  pstack   : Cell;     // base address of a parameter stack cell array
  rsp      : InoxAddress; // Stack pointer for call returns, goes downward
  rstack   : InoxAddress; // Base address of return stack, 32 entries

  constructor(
    parent   : Cell,
    act      : InoxAddress,
    ip       : InoxAddress,
    ram_size : InoxValue
  ){
    // this.cell is set in make_task()
    // Parent task list, up to root task
    this.parent = parent;
    // Current activation for the new task
    this.act    = act;
    // Init memory and cpu context
    this.init( ip, ram_size );
  }

  init( ip : InoxAddress, ram_size : InoxValue ){
    // Round size to the size of a cell
    var size = ( ram_size / 8 ) * 8;
    // Current instruction pointer
    this.ip     = ip;
    // Room for stacks, both parameters and returns
    this.mp     = allocate_bytes( size );
    // Return stack is at the very end
    this.rstack = this.mp + size - 4
    // That's where the current return stack pointer is also
    this.rsp    = this.rstack;
    // Parameter stack is just below the return stack
    this.pstack = this.rstack - ( 4 * 32 );
    // That's where the current parameter stack pointer is
    this.psp    = this.pstack;
  }

  get_context() : CpuContext {
    return new CpuContext( this.ip, this.rsp, this.psp );
  }

  restore_context( ctx : CpuContext ) : void {
    current_task = this;
    current_ip   = this.ip  = ctx.ip;
    current_rsp  = this.rsp = ctx.rsp;
    current_psp  = this.psp = ctx.psp;
  }
}

function make_task( parent : Cell, act : Cell ) : Cell {
  let size = 1024 * 32; // 32 kb
  var new_task = new Task( parent, 1, act, size );
  // Fill parameter stack with act's parameters
  // ToDo [ act.locals ];
  let cell = make_basic_object( new_task );
  new_task.cell = cell;
  return cell;
};

// Current task is the root task
let root_task: Cell = make_task( void_cell, void_cell );
current_task = get_basic_object( root_task );

// Current task changes at context switch
task_switch( current_task );

// There is nothing in the free list
let free_tasks = void_cell;

function allocate_task( parent : Cell, act:Cell ) : Cell {
  if( free_tasks == void_cell )return make_task( parent, act );
  let task = free_tasks;
  let task_object = get_basic_object( task );
  task_object.ip = 1;
  task_object.parent = parent;
  task_object.act = act;
  return task;
}

function free_task( task : Cell ){
// add task to free list
  set_next_cell( task, free_tasks );
  free_tasks = task;
}

// builtin to switch to another task
function builtin_task_switch() : void {
  var next_task = pop();
  task_switch( get_basic_object( next_task ) );
}

function task_switch( task : Task ) : void {
  task.restore_context( task.get_context() );
}

function builtin_make_task( ip : InoxAddress ) : void {
  var parameters = get_basic_object( pop() );
  var act = allocate_act( current_task.cell );
  var new_task : Cell = allocate_task( current_task.cell, act );
  // ToDo: push( parameters ); into new task
  let t : Task = get_basic_object( new_task );
  t.ip = ip;
  push( make_cell( symbol_Task, symbol_Task, new_task ) );
};


// -----------------------------------------------------------------------
//  Builtins
//

let all_builtins_by_id = new Map< InoxCode, Function >();

// Helper to define a builtin
function builtin( name : string, fn : Function ){
  let symbol = make_symbol( name );
  all_builtins_by_id.set( fetch_value( symbol ), fn );
}

builtin( "make_task",   builtin_make_task   );
builtin( "task_switch", builtin_task_switch );

// ToDo: core dictionary

// Parameters stack manipulations
builtin( "push", push );
builtin( "pop", pop );
builtin( "dup", function( task ){
  // ToDo: optimize this
  let top = pop();
  push( top );
  push( top );
} );
builtin( "drop", pop );

function cell_to_string( cell : Cell ) : string {

  let buf : string = "";
  let info = fetch_info( cell );
  let type = unpack_type( info );
  let name = unpack_name( info );
  let value : InoxValue = fetch_value( cell );

  buf += type;
  buf += "/" + name + "/";
  buf += symbol_id_to_string( type ) + "/";
  buf += symbol_id_to_string( name ) + "/";

  switch( type ){
    case 0 : break; // buf += "Void";
    case 1 : // buf += "Symbol";
      buf += "/" + symbol_id_to_string( value );
    break;
    case 2 : // buf += "String";
    case 3 : // buf += "Integer";
    case 4 : // buf += "Object";
      if( all_objects_by_id.has( value ) ){
        let obj = all_objects_by_id.get( value );
        buf += obj.toString();
      }else{
        buf += "->?";
      }
    break;
    case 5 : buf += "Function";
    break;
    case 6 : buf += "Act";
    break;
    case 7 : buf += "Word";
    break;
    default : buf += "???";
    break;
  }

  return buf;

}

function builtin_to_string(){
  let str = cell_to_string( pop() );
  push( make_string( str ) );
} );

builtin( "to_string", builtin_to_string );

function builtin_log(){
  console.log( cell_to_string( pop() ) );
}

builtin( "log", builtin_log );

const symbol_method_missing
= make_symbol( "method_missing" );
const symbol_compile_method_missing
= make_symbol( "compile_method_missing" );


// -----------------------------------------------------------------------
//  Tokenizer
//

type Token = {
  type  : string,
  value : string,
  index : u32
};

const void_token : Token = {
  type  : "",
  value : "",
  index : 0 // ToDo line/column
};

let text        = source;
let text_length = text.length;
let back_token  = void_token;
let token_state = "comment";
let text_cursor = 0;

// Smart detection of comments syntax, somehow
let is_c_style     = false;
let is_forth_style = false;
let is_lisp_style  = false;
let comment_multiline_begin       = "";
let comment_multiline_begin_begin = "";
let comment_multiline_end         = "";
let comment_multiline_end_end     = "";
// ToDo: nesting multiline comments
let comment_monoline_begin        = "";
let comment_monoline_begin_begin  = "";
let first_comment = true;

function tokenizer_restart( source : string ){
  text        = source;
  text_length = text.length;
  back_token  = void_token;
  token_state = "base";
  text_cursor = 0;
  is_c_style = is_forth_style = is_lisp_style = false;
  first_comment = true;
  token_state = "comment";
}

tokenizer_restart( source );

function make_token( type : string, value : string, ii : u32 ) : Token {
  return {
    type  :  type,
    value : value,
    index : ii - 1 // ii is always one character ahead
  }
}

function unget_token( token : Token ) : void {
  back_token = token;
}

function get_next_token() : Token {

  // If there is some token already, deliver it
  let token : Token = back_token;
  if( token !== void_token ){
    back_token = void_token;
    return token;
  }

  // Collect token text
  let buf   = "";
  let sep   = "";
  let ii    = text_cursor;
  let state = token_state;
  let ch    = "";
  let is_space = false;
  let is_eol   = false; // End Of Line
  let next_ch = "";

  function ch_is_space( ch : string ){
    // ToDo: avoid regexp
    return /\s/.test( ch.charAt( 0 ) );
  }

  function ch_is_eol( ch : string ){
    // ToDo: handle crlf better
    if( ch == "\n" )return true;
    if( ch == "\r" )return true;
    return false;
  }

  eat:
  while( true ){

    // EOF
    if( ii == text_length ){
      if( state == "base" ){
        token = { type : "eof", value : "", index : ii }
        break eat;
      }
      // Premature, something else was expected
      token = {
        type  : "error",
        value : "eof in token " + state,
        index : ii
      };
      break eat;
    }

    // Get next character, check if it is a space or end of line
    ch = text[ ii ];
    ii++;
    is_space = ch_is_space( ch );
    is_eol = ch_is_eol( ch );

    // Also get next next char, some lookahead helps sometimes
    if( ii == text_length ){
      next_ch = " ";
    }else{
      next_ch = text[ ii ];
      // Treat lf like a space
      if( ch_is_eol( ch ) ){
        ch = " ";
      }
    }

    // Collect comment
    if( state == "comment" ){

      // When inside the first comment at the very beginning of the file
      if( first_comment && !is_space ){

        // ToDo: skip #! shebang
        // see https://en.wikipedia.org/wiki/Shebang_(Unix)

        // C style of comment, either // or /* xxx */
        if( buf == "/*" || buf == "//" ){
          is_c_style = true;
          comment_multiline_begin       = "/*";
          comment_multiline_begin_begin = "/";
          comment_multiline_end         = "*/";
          comment_multiline_end_end     = "/";
          comment_monoline_begin        = "//";
          comment_monoline_begin_begin  = "/";

        // Forth style, either \ or ( xxx )
        }else if( buf == "(" ){
          is_forth_style = true;
          comment_multiline_begin       = "(";
          comment_multiline_begin_begin = "(";
          comment_multiline_end         = ")";
          comment_multiline_end_end     = ")";
          comment_monoline_begin        = "\\";
          comment_monoline_begin_begin  = "\\";

        // Lisp style, ;
        }else if( buf == ";" ){
          is_lisp_style = true;
          comment_monoline_begin        = ";";
          comment_monoline_begin_begin  = ";";

        // Prolog style, %
        }else if( buf == "%" ){
          is_lisp_style = true;
          comment_monoline_begin        = "%";
          comment_monoline_begin_begin  = "%";
        }
      }

      // If this is a monoline comment ending, emit it
      if( is_eol
      && comment_monoline_begin
      && ( buf.slice( 0, comment_monoline_begin.length )
        == comment_monoline_begin )
      ){
        // Emit token, without start of comment sequence
        token = {
          type  : "comment",
          value : buf.slice( comment_monoline_begin.length - 1 ),
          index : ii
        };
        break eat;
      }

      // If this terminates the comment, emit the comment
      if( ch == comment_multiline_end_end
      && (
        buf.slice(
          buf.length - comment_multiline_end.length - 1
        )
        == comment_multiline_end.slice(
          0, comment_multiline_end.length - 1
        )
      )){
        // Emit token, without start & end of comment sequence
        token = {
          type  : "comment_multiline",
          value : buf.slice(
            comment_monoline_begin.length - 1,
          ),
          index : ii
        };
        break eat;
      }

      // Keep Collecting characters
      buf += ch;
      continue eat;
    }

    // Skip whitespaces
    if( state == "base" ){

      // skip whitespaces
      if( is_space ){
        continue eat;
      }

      // Strings starts with "
      if( ch == "\"" ){
        // ToDo: handle single quote 'xx' and backquote `xxxx`
        // ToDo: handle templates litterals
        state = "string";
        continue eat;
      }

      // ToDo: JSON starts with ~ ?
      // See https://www.json.org/json-en.html

      buf = ch;

      // Comments start differently depending on style
      if( ch == comment_monoline_begin_begin
      ||  ch == comment_multiline_begin_begin
      ){
        state = "comment";
        continue eat;
      }

      // Else, it is a "word", including "separators" sometimes
      state = "word";
      continue eat;

    } // base state

    // Collect string until final "
    if( state == "string" ){

      // End of string
      if( ch == "\"" ){
        token = {
          type  : "string",
          value : buf,
          index : ii
        };
        state = "base";
        break eat;
      }

      // ToDo: handle escape sequences
      buf += ch;
      continue eat;

    } // string state

    // Collect word until separator
    if( state == "word" ){

      // Normalize all whitespaces into a simple space character
      if( is_space ){
        ch = " ";
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
      if(
        (ch == "(" ||  ch == '[' ||  ch == '{' )
      && buf.length > 0
      ){
        unget_token( { type : ch, value : ch, index : ii } );
        token =  { type : "word", value : buf, index : ii - 1 } ;
        state = "base";
        continue eat;
      }

      // Some characters cannot be inside a word
      // ToDo: what about # ?
      if( ch == " "
      ||  ch == "~" // ToDo: ?
      ||  ch == "^" // ToDo: ?
      ||  ch == "." // ToDo: dot notation where a.b( c ) eqv b( a, c )
      ||  ch == "\\"
      ||  ch == ":" // ToDo: what about :: ?
      ||  ch == "." // ToDo: what about .. ?
      ||  ch == ","
      ||  ch == "'"
      ||  ch == "`"
      ||  ch == '"'
      ||  ch == '(' // ToDo: what about ()
      ||  ch == ')'
      ||  ch == '[' //ToDo: what about [] ?
      ||  ch == ']'
      ||  ch == '{' // ToDo: trailing lambdas where { x... } ev do x... end
      ||  ch == '}' // ToDo: what about {}, ){, ]} ?
      // ToDo: what about all two characters combinations with (, { and [ ?
      ){

        // Handle line continuation when \ is last character on line
        if( ch == "\\"
        && ch_is_eol( next_ch )
        ){
          // Handle crlf
          if( next_ch == "\r" ){
            ii++;
          }
          // Skip lf
          ii++;
          continue eat;
        }

        // Either a word followed by some separator
        if( buf.length ){
          token = { type : "word", value : buf, index : ii - 1 };
          // Also push back a separator token unless it is just a space
          if( ch != " " ){
            // But only if there is a space right after it
            if( next_ch == " " )
            unget_token( { type : ch, value : ch, index : ii } );
          }
        // Or just the separator itself, with nothing before it
        }else{
          token = { type : ch, value : ch, index : ii };
        }
        // In both case, emit a token and get back to normal
        state = "base";
        break eat;

      }

      buf += ch;
      continue eat;

    } // word state

    // ???
    token = {
      type  : "error",
      value : "bad state in get_next_token()",
      index : ii
    };
    break eat;

  } // eat loop

  text_cursor = ii;
  token_state = state;
  return token;

} // get_next_token()


// -----------------------------------------------------------------------
//  run()
//

function run_fast( ctx : CpuContext ){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  // Setup cpu context, instruction pointer, parameter & return stacks
  let ip  : InoxAddress = ctx.ip;
  let psp : InoxAddress = ctx.psp;
  let rsp : InoxAddress = ctx.rsp;

  function push( cell : Cell ){
  // Push data on parameter stack
    psp -= 4; // size of cell pointer
    store32( psp, cell );
  }

  function pop() : Cell {
  // Consume top of parameter stack
    let cell : Cell = load32( psp );
    psp +=4; // size of cell pointer
    return cell;
  }

  let code : InoxCode;

  while( true ){

    // Get 16 bits cell to execute and move forward
    code = load16( ip );
    ip += 2; // size of InoxCode

    // Lower bits tell what type of code this is, builtin or words
    code = ( code & 0xfffe );

    // If this is a builtin, execute it
    if( ( code & 1 ) == 1 ){

      // Special "next" builtin is just a jump to the return address
      if( code == 1 ){
        // Jump to address poped from top of stack
        ip = load32( rsp );
        rsp += 4; // size of InoxAddress
        continue;
      }

      // Special "jump" are relative jumps
      if( ( code & 0x8000 ) == 0x8000 ){
        rsp += ( code << 1 );
        continue;
      }

      // Else, it is the id of a bultin
      let fun : Function = all_builtins_by_id.get( code );
      fun.apply( undefined );
      if( !current_task )break;
      continue;
    }

    // else it is almost the address of some code to run

    // Push the current instruction pointer onto the return stack
    rsp -= 4; // size of an InoxAddress
    store32( rsp, ip );

    // Jump to the destination's address
    ip = get_word_definition_by_id( code );

    // ToDo: what about literals
  }

  return new CpuContext( ip, psp, rsp );

} // run_fast()

function run(){
  let old_ctx = new CpuContext( current_ip, current_psp, current_rsp );
  let new_ctx = run_fast( old_ctx );
  current_ip  = new_ctx.ip;
  current_psp = new_ctx.psp;
  current_rsp = new_ctx.rsp;
}

function run_word( word : string ){
  current_ip = get_word_definition( word );
  run();
}

function builtin_inox_eval(){
  var source = cell_to_string( pop() );
  tokenizer_restart( source );
  run();
}

builtin( "inox-eval", builtin_inox_eval );

// Compile the bootstrap vocabulary
let bootstrap_code : string =
`( let's go forth )

`;
push( make_string( bootstrap_code ) );
run_word( "inox-eval" );

// If source code was provided, push it on the parameter stack
// See http://c2.com/cybords/pp4.cgi?muforth/README
if( source ){
  push( make_string( source) );
  run_word( "inox-eval" );
  run_word( "main" );
}

// ToDo: return diff to apply instead of new state
let new_state = state; // ToDo: encode top of stack in json
return new_state;

}


// --------------------------------------------------------------------------
// Smoke test
//

inox( "{}", "{}", [

  '( forth )',
  ': hello CR ." Hello world!" ;',
  'hello ;'

].join( "\n" ) );

exports.inox = inox;
