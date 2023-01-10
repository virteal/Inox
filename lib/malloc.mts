/* malloc.ts
 *   Inox dynamic memory allocator.
 *
 *  January 9 2023 by JHR, with the help of Copilot.
 */

/*
This module exports a bytes allocator that provides an efficient way to allocate and deallocate blocks of bytes within an array buffer of 32 bits words. Blocks are aligned on an 8-bytes boundary. Each block has a header that stores informations about the block, including the size of the block and a reference counter, and a magic number footer. The reference counter is used to track the number of pointers to the block. The block is only deallocated if the reference counter reaches zero.

An exported initialization function specifies the initial size in bytes of the array buffer and a function to be called if the allocator runs out of memory and an optional function to be called if an attempt is made to access an invalid block of memory.

The allocator uses buddy allocation to allocate small blocks of memory faster. The allocator combines adjacent free blocks when looking for a free block. The allocator does not support shrinking blocks. ToDo: Add support for shrinking blocks.

The module has the following main exported functions:

  - init(bufferSize: number, outOfMemory: () => void, invalidMemoryAccess: () => void): boolean : Initializes the allocator. The bufferSize parameter specifies the initial size in bytes of the array buffer. The outOfMemory parameter specifies a function to be called if the allocator runs out of memory. The invalidMemoryAccess parameter specifies a function to be called if an attempt is made to access an invalid block of memory. Returns false if the test suite fails, true otherwise. The test suite is run after the initialization.

  - malloc(size: number): number: Allocates a block of bytes of the specified size and returns the starting address of the block. The block is initialized to zero. If the allocator runs out of memory, the function specified in the constructor is called and the function returns zero. When looking for a free block, the allocator combine adjacent free blocks. The allocator does support shrinking blocks.

  - free(ptr: number): void: unlock the block of memory starting at the specified address. The block's reference count is decremented and the block is only deallocated if the reference count reaches zero. If the block is deallocated, the allocator combines adjacent free blocks.

  - lock(ptr: number): void: Increments the reference count for the block of memory starting at the specified address. The reference count is used to track the number of pointers to the block. The block is only deallocated if the reference count reaches zero.

  - get_size(ptr: number): number: Returns the size of the block of memory starting at the specified address. The size does not includes the header, the footer, only the adjusted requested size. The size is a multiple of 8.

  - is_last_reference(ptr: number): boolean: Returns true if the block of memory starting at the specified address has a reference count of one, false otherwise. The reference count is used to track the number of pointers to the block. The block is only deallocated if the reference count reaches zero.

  - get_reference_count(ptr: number): number: Returns the reference count for the block of memory starting at the specified address. The reference count is used to track the number of pointers to the block. The block is only deallocated if the reference count reaches zero.

  - realloc(ptr: number, size: number): number: Reallocates the block of memory starting at the specified address. If the new size is larger, the additional memory is initialized to zero. If the new size is smaller, the excess memory is deallocated (ToDo). It returns the starting address of the reallocated block. To speed up the initialization of the additional memory, the allocator uses 32 bits stores to initialize the memory (ToDo). If the allocator runs out of memory, the function specified in the constructor is called and the function returns zero.

  - store_32( ptr, value ) : void: Stores the specified 32 bits value at the specified address. The address must be aligned on a 4 bytes boundary. The value is stored in little endian format.

  - store_64( ptr, v1, v2 ) : void. Stores the two specified 32 bits values at the specified address and the address + 4. The address is aligned on a 8 bytes boundary. The values are stored in little endian format.

  - load_32( ptr ) : number. Loads a 32 bits value from the specified address. The address must be aligned on a 4 bytes boundary. The value is stored in little endian format.

  - test_suite() : boolean. Runs a test suite on the allocator. Returns true if the test suite passes, false otherwise. The test suite is run after the initialization.

  - check_integrity() : boolean. Checks the integrity of the allocator. Returns true if the allocator is in a consistent state, false otherwise. Also update the total number of bytes allocated and the total number of bytes free and the total overhead of the allocator.

Copilot generatesd some part of the implementation and a test suite for the class. Don't use CamelCase, use snake_case instead.

*/

// Copilot generated code for the allocator, hand edited.

const MAGIC_NUMBER = 0x12345678;  // Magic number

let _buffer: ArrayBuffer;  // The array buffer
let _buffer8: Uint8Array;  // The array buffer as an array of 8 bits words
let _buffer32: Uint32Array;  // The array buffer as an array of 32 bits words
let _free_list: number;  // The free list. It is a linked list of free blocks.
let _out_of_memory: () => void;
let _invalid_memory_access: () => void;

// Statistics
let _total_bytes_allocated = 0;  // Total number of bytes allocated
let _total_bytes_free = 0;       // Total number of bytes free
let _total_overhead = 0;        // Total overhead of the allocator


// Buddy allocation for faster allocation of small blocks.
const MAX_BUDDY_SIZE = 2048;
const MAX_BUDDY_LEVEL = 11;
const MIN_BUDDY_LEVEL = 3;

// The buddy list is an array of linked lists of free blocks.
let _buddy_lists = new Array<number>(MAX_BUDDY_LEVEL + 1);


function init(
  bufferSize: number,
  _out_of_memory: () => void,
  _invalid_memory_access: () => void
): boolean {
  _buffer = new ArrayBuffer(bufferSize);
  _buffer8 = new Uint8Array(_buffer);
  _buffer32 = new Uint32Array(_buffer);
  _out_of_memory = _out_of_memory;
  _invalid_memory_access = _invalid_memory_access;
  // Buddy allocation
  for (let i = 0; i < _buddy_lists.length; ++i) {
    _buddy_lists[i] = 0;
  }
  // Initialize the free list
  _free_list = 0;
  set_header(_free_list, 0);
  set_size(_free_list, bufferSize - get_headerSize());
  set_reference_count(_free_list, 0);
  set_magic_number(_free_list, MAGIC_NUMBER);
  // Run the test suite
  return test_suite();
}


function get_headerSize(): number {
  return 4;
}

function getFooterSize(): number {
  return 4;
}


function get_header(ptr: number): number {
  return _buffer32[ptr >> 2];
}

function set_header(ptr: number, header: number): void {
  _buffer32[ptr >> 2] = header;
}


function get_magic_number(ptr: number): number {
  return _buffer32[(ptr + get_size(ptr) + 4) >> 2];
}


function set_magic_number(ptr: number, magicNumber: number): void {
  _buffer32[(ptr + get_size(ptr) + 4) >> 2] = magicNumber;
}


function ajusted(size: number): number {
  return ( size + 7 ) & ~7;
}


function get_size(ptr: number): number {
  return get_header(ptr + 4);
}

function get_reference_count(ptr: number): number {
  return get_header(ptr + 8);
}

function set_reference_count(ptr: number, referenceCount: number): void {
  set_header(ptr + 8, referenceCount);
}

function getBlockStart(ptr: number): number {
  return ptr + get_headerSize();
}

function getBlockNext(ptr: number): number {
  return get_header(ptr);
}

function set_size(ptr: number, size: number): void {
  set_header(ptr + 4, size);
}

function malloc( size: number): number {
  if (size === 0) {
    return 0;
  }
  size = ajusted(size);
  let ptr = findFreeBlock(size);
  if (ptr === 0) {
    if (_out_of_memory) {
      _out_of_memory();
    }
    return 0;
  }
  splitBlock(ptr, size);
  lock(ptr);
  return ptr;
}

function findFreeBlock(size: number): number {
  // Buddy allocation
  if (size <= MAX_BUDDY_SIZE) {
    let level = MIN_BUDDY_LEVEL;
    while (level <= MAX_BUDDY_LEVEL && size > (1 << level)) {
      ++level;
    }
    while (level <= MAX_BUDDY_LEVEL) {
      let ptr = _buddy_lists[level];
      if (ptr !== 0) {
        _buddy_lists[level] = getBlockNext(ptr);
        return ptr;
      }
      ++level;
    }
  }
  // First fit
  let ptr = _free_list;
  while (ptr !== 0) {
    if (get_size(ptr) >= size) {
      // Split the block if it is too big
      if (get_size(ptr) - size > get_headerSize() + 8) {
        splitBlock(ptr, size);
      }
      return ptr;
    }
    ptr = getBlockNext(ptr);
  }
  return 0;
}

function splitBlock(block: number, size: number): void {
  let remainingSize = get_size(block) - size;
  if (remainingSize > get_headerSize() + 8) {
    let remainingBlock = block + size;
    set_header(remainingBlock, getBlockNext(block));
    set_size(remainingBlock, remainingSize);
    set_reference_count(remainingBlock, 0);
    set_magic_number(remainingBlock, MAGIC_NUMBER);
    setBlockNext(block, remainingBlock);
    set_size(block, size);
  }
}


function setBlockNext(ptr: number, next: number): void {
  set_header(ptr, next);
}



function free(ptr: number): void {
  if (ptr === 0) {
    return;
  }
  if (get_magic_number(ptr - get_headerSize()) !== MAGIC_NUMBER) {
    if (_invalid_memory_access) {
      _invalid_memory_access();
    }
    return;
  }
  if (is_last_reference(ptr - get_headerSize())) {
    set_reference_count(ptr - get_headerSize(), 0);
    coalesce(ptr);
  } else {
    set_reference_count(ptr - get_headerSize(), get_reference_count(ptr - get_headerSize()) - 1);
  }
}


function is_free(ptr: number): boolean {
  return get_reference_count(ptr) === 0;
}


function coalesce(ptr: number): void {
  // Check if the block is small enough to use buddy allocation
  if (get_size(ptr) <= MAX_BUDDY_SIZE) {
    let level = MIN_BUDDY_LEVEL;
    while (level <= MAX_BUDDY_LEVEL && get_size(ptr) > (1 << level)) {
      ++level;
    }
    // Add the block to the buddy list
    set_header(ptr, _buddy_lists[level]);
    _buddy_lists[level] = ptr;
    return;
  }
  // Find the best fit free block
  let bestPtr = 0;
  let bestSize = 0;
  let ptr2 = _free_list;
  while (ptr2 !== 0) {
    if (is_free(ptr2)) {
      const size = get_size(ptr2);
      if (size >= get_size(ptr)) {
        if (bestPtr === 0 || size < bestSize) {
          bestPtr = ptr2;
          bestSize = size;
        }
      }
    }
    ptr2 = getBlockNext(ptr2);
  }
  if (bestPtr !== 0) {
    // Add the block to the free list
    setBlockNext(ptr, getBlockNext(bestPtr));
    setBlockNext(bestPtr, ptr);
    return;
  }
  // Add the block to the free list
  setBlockNext(ptr, _free_list);
  _free_list = ptr;
}


function realloc(ptr: number, size: number): number {

  if (ptr === 0) {
    return malloc(size);
  }

  if (get_magic_number(ptr - get_headerSize()) !== MAGIC_NUMBER) {
    if (_invalid_memory_access) {
      _invalid_memory_access();
    }
    return 0;
  }

  // If same size or less, do nothing
  if (size <= get_size(ptr - get_headerSize())) {
    return ptr;
  }

  // ToDo: this is a naive implementation

  const new_ptr = malloc(size);
  // Copy old data
  const old_size = get_size(ptr - get_headerSize());
  const copy_size = size < old_size ? size : old_size;
  for (let i = 0; i < copy_size; ++i) {
    store8(new_ptr + i, load8(ptr + i));
  }
  free(ptr);
  return new_ptr;

}


function lock(ptr: number): void {
  if (ptr === 0) {
    return;
  }
  if (get_magic_number(ptr - get_headerSize()) !== MAGIC_NUMBER) {
    if (_invalid_memory_access) {
      _invalid_memory_access();
    }
    return;
  }
  set_reference_count(ptr - get_headerSize(), get_reference_count(ptr - get_headerSize()) + 1);
}


function is_last_reference(ptr: number): boolean {
  return get_reference_count(ptr) === 1;
}

export function store32(ptr: number, value: number): void {
  _buffer32[ptr >> 2] = value;
}

export function store64(ptr: number, v1: number, v2: number): void {
  _buffer32[ptr >> 2] = v1;
  _buffer32[(ptr + 4) >> 2] = v2;
}

export function load32(ptr: number): number {
  return _buffer32[ptr >> 2];
}

export function load64(ptr: number): [number, number] {
  return [_buffer32[ptr >> 2], _buffer32[(ptr + 4) >> 2]];
}

export function load8(ptr: number): number {
  return _buffer8[ptr];
}

export function store8(ptr: number, value: number): void {
  _buffer8[ptr] = value;
}

export function load16(ptr: number): number {
  return _buffer8[ptr] | (_buffer8[ptr + 1] << 8);
}

export function store16(ptr: number, value: number): void {
  _buffer8[ptr] = value;
  _buffer8[ptr + 1] = value >> 8;
}

export function load32u(ptr: number): number {
  return _buffer32[ptr >> 2];
}

export function load64u(ptr: number): [number, number] {
  return [_buffer32[ptr >> 2], _buffer32[(ptr + 4) >> 2]];
}

export function load8u(ptr: number): number {
  return _buffer8[ptr];
}

export function load16u(ptr: number): number {
  return _buffer8[ptr] | (_buffer8[ptr + 1] << 8);
}

export function load32f(ptr: number): number {
  // https://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-convert-a-float-to-an-int-in-javascript
  const int32 = new Int32Array(1);
  const float32 = new Float32Array(int32.buffer);
  int32[0] = _buffer32[ptr >> 2];
  return float32[0];
}

export function load64f(ptr: number): number {
  // https://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-convert-a-float-to-an-int-in-javascript
  const int32 = new Int32Array(2);
  const float64 = new Float64Array(int32.buffer);
  int32[0] = _buffer32[ptr >> 2];
  int32[1] = _buffer32[(ptr + 4) >> 2];
  return float64[0];
}

export function store32f(ptr: number, value: number): void {
  // https://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-convert-a-float-to-an-int-in-javascript
  const int32 = new Int32Array(1);
  const float32 = new Float32Array(int32.buffer);
  float32[0] = value;
  _buffer32[ptr >> 2] = int32[0];
}

export function store64f(ptr: number, value: number): void {
  // https://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-convert-a-float-to-an-int-in-javascript
  const int32 = new Int32Array(2);
  const float64 = new Float64Array(int32.buffer);
  float64[0] = value;
  _buffer32[ptr >> 2] = int32[0];
  _buffer32[(ptr + 4) >> 2] = int32[1];
}

function check_integrity(): boolean {

  // Reset statistics
  _total_bytes_allocated = 0;
  _total_bytes_free = 0;
  _total_overhead = 0;

  // Starts at the beginning of the buffer
  let ptr = get_headerSize();
  //
  while (ptr < _buffer32.byteLength) {
    // Update statistics
    if( get_reference_count(ptr) > 0 ){
      _total_bytes_allocated += get_size(ptr);
      _total_overhead += get_size(ptr) - get_size(ptr);
    }else{
      _total_bytes_free += get_size(ptr);
    }
    _total_overhead += get_headerSize() + getFooterSize();
    // Check magic number
    if (get_magic_number(ptr) !== MAGIC_NUMBER) {
      console.log( "Magic number mismatch at " + ptr.toString(16) );
      debugger;
      return false;
    }
    ptr += get_size(ptr);
  }
  return true;
}


function test_suite() : boolean {

  // Test malloc
  let ptr = malloc(4);
  if( ! check_integrity() ) {
    return false;
  }
  store32(ptr, 0x12345678);
  if (load32(ptr) !== 0x12345678) {
    return false;
  }
  free(ptr);
  if( ! check_integrity() ) {
    return false;
  }

  // Test store64
  ptr = malloc(8);
  if( ! check_integrity() ) {
    return false;
  }
  store64(ptr, 0x12345678, 0x87654321);
  const [v1, v2] = load64(ptr);
  if (v1 !== 0x12345678 || v2 !== 0x87654321) {
    return false;
  }
  free(ptr);

  // Test store32f
  ptr = malloc(4);
  store32f(ptr, 1.234);
  if (load32f(ptr) !== 1.234) {
    return false;
  }
  free(ptr);

  // Test store64f
  ptr = malloc(8);
  store64f(ptr, 1.234);
  if (load64f(ptr) !== 1.234) {
    return false;
  }
  free(ptr);

  // Test realloc
  ptr = malloc(4);
  store32(ptr, 0x12345678);
  ptr = realloc(ptr, 8);
  store64(ptr, 0x12345678, 0x87654321);
  const [v3, v4] = load64(ptr);
  if (v3 !== 0x12345678 || v4 !== 0x87654321) {
    return false;
  }
  free(ptr);

  // Test shrink
  ptr = malloc(8);
  store64(ptr, 0x12345678, 0x87654321);
  ptr = realloc(ptr, 4);
  if (load32(ptr) !== 0x12345678) {
    return false;
  }
  free(ptr);

  // Test fragmentation
  const ptrs = [];
  for (let i = 0; i < 100; i++) {
    ptrs.push(malloc(4));
  }
  for (let i = 0; i < 100; i++) {
    free(ptrs[i]);
  }
  for (let i = 0; i < 100; i++) {
    ptrs[i] = malloc(4);
  }
  for (let i = 0; i < 100; i++) {
    free(ptrs[i]);
  }


  return check_integrity();
}

export default {
  init,
  check_integrity,
  malloc,
  realloc,
  lock,
  free,
  get_size,
  get_reference_count,
  is_last_reference,
  store8,
  load8,
  load8u,
  store16,
  load16,
  load16u,
  store32,
  load32,
  load32u,
  store64,
  load64,
  load64u,
  store32f,
  load32f,
  store64f,
  load64f,
};
