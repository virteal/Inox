/*
The BytesAllocator class is a singleton that provides a way to allocate and deallocate blocks of memory in a fixed-size array buffer provided by the user.
The class has a constructor that takes a buffer, a function to be called if the allocator runs out of memory, and a function to be called if an attempt is made to access an invalid block of memory.
The class has the following methods:
  - malloc(size: number): number: Allocates a block of memory of the specified size and returns the starting address of the block. The block is aligned on an 8-byte boundary and has a header that stores metadata about the block, including a magic number, the size of the block, and a reference count.
  - free(ptr: number): void: Deallocates the block of memory starting at the specified address. The block's reference count is decremented and the block is only deallocated if the reference count reaches zero.
  - lock(ptr: number): void: Increments the reference count for the block of memory starting at the specified address.
  - unlock(ptr: number): void: Decrements the reference count for the block of memory starting at the specified address. If the reference count reaches zero, the block is deallocated.
  - getSize(ptr: number): number: Returns the original size of the block of memory starting at the specified address.
  - isLastReference(ptr: number): boolean: Returns true if the block of memory starting at the specified address has a reference count of one, false otherwise.
  - getReferenceCount(ptr: number): number: Returns the reference count for the block of memory starting at the specified address.
  - realloc(ptr: number, size: number): number: Reallocates the block of memory starting at the specified address to the new size. If the new size is larger, the additional memory is uninitialized. If the new size is smaller, the excess memory is deallocated. Returns the starting address of the reallocated block.

Optimization: The header for small blocks (those smaller than SMALL_BLOCK_SIZE) has been optimized to reduce the overhead.

*/
