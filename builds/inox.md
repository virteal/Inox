# Inox primitives


| Primitive | Code |
| --- | --- |
| a-list? | true if TOS is a list |
| nil? | true if TOS is an empty list |
| list | make a new list, empty |
| list-cons | make a new list, with TOS as head and NOS as tail |
| list-car | get the head of a list |
| list-length | number of elements in a list |
| list-append | append two lists |
| list-reverse | reverse a list |
| list-equal? | true if two lists have the same elements in the same order |
| little-endian? | true if the machine is little endian |
| a-primitive? | true if TOS tag is also the name of a primitive |
| return | jump to return address |
| actor | push a reference to the current actor |
| switch-actor | non preemptive thread switch |
| make-actor | create a new actor with an initial IP |
| breakpoint | to break into the debugger |
| memory-dump | output a dump of the whole memory |
| cast | change the type of a value, unsafe |
| rename | change the name of the NOS value |
| goto | jump to some absolue IP position, a branch |
| a-void? | true if TOS was a void type of cell |
| a-tag? | true if TOS is a tag |
| a-boolean? | true if TOS was a boolean |
| an-integer? | true if TOS was an integer |
| a-text? | true if TOS was a text |
| a-reference? | true if TOS was a reference to an object |
| a-verb? | true if TOS was a verb |
| a-proxy? | true if TOS was a reference to proxied object |
| a-flow? | true if TOS was a flow |
| push | push the void on the data stack |
| drop | remove the top of the data stack |
| drops | remove cells from the data stack |
| dup | duplicate the top of the data stack |
| 2dup | duplicate the top two cells of the data stack |
| ?dup | duplicates the top of the data stack if TOS is non zero |
| dups | duplicate cells from the data stack |
| overs | push cells from the data stack |
| 2over | push the third and fourth cells from TOS |
| nip | removes the second cell from the top of the stack |
| tuck | pushes the second cell from the top of the stack |
| swap | swaps the top two cells of the data stack |
| swaps | swaps the top cells of the data stack |
| 2swap | swaps the top four cells of the data stack |
| over | push the second cell from the top of the stack |
| rotate | rotate the top three cells of the data stack |
| roll | rotate cells from the top of the stack |
| pick | pushes the nth cell from the top of the stack |
| data-depth | number of elements on the data stack |
| clear-data | clear the data stack, make it empty |
| data-dump | dump the data stack, ie print it |
| control-depth | number of elements on the control stack |
| clear-control | clear the control stack, make it empty |
| control-dump | dump the control stack, ie print it |
| text-quote | turn a text into a valid text literal |
| text-to-integer | convert a text literal to an integer |
| text-to-integer | convert a text literal into an integer |
| text-hex-to-integer | convert a text literal to an integer |
| text-octal-to-integer | convert a text literal to an integer |
| text-binary-to-integer | converts a text literal to an integer |
| integer-to-hex | converts an integer to an hexadecimal text |
| integer-to-octal | convert an integer to an octal text |
| integer-to-binary | converts an integer to a binary text |
| text-unquote | turns a JSON text into a text |
| debugger | invoke host debugger, if any |
| debug | activate lots of traces |
| normal-debug | deactivate lots of traces, keep type checking |
| log | enable/disable traces and checks |
| fast! | Switch to "fast mode", return previous state |
| fast? | Return current state for "fast mode" |
| noop | No operation - does nothing |
| assert-checker | internal |
| assert | assert a condition, based on the result of a block |
| type-of | Get type of the TOS value, as a tag |
| name-of | Get the name of the TOS value, a tag |
| value-of | Get the raw integer value of the TOS value |
| info-of | Get the packed type and name of the TOS value |
| pack-info | Pack type and name into an integer |
| unpack-type | Unpack type from an integer, see pack-info |
| unpack-name | Unpack name from an integer, see pack-info |
| class-of | Get the most specific type name (as a tag) |
| break | exit loop |
| sentinel | install a sentinel inside the control stack |
| loop-until | loop until condition is met |
| loop-while | loop while condition is met |
| + | addition operator primitive |
| =? | value equality |
| <>? | value inequality, the boolean opposite of =? value equality. |
| ==? | object identicallity, ie shallow equality, not deep equality. |
| not==? | object inquality, boolean opposite of ==? shallow equality. |
| ? | operator |
| something? | operator |
| void? | operator - true when TOS is of type void and value is 0. |
| true? | operator |
| false? | operator |
| not | unary boolean operator |
| or | binary boolean operator |
| and | binary boolean operator |
| is-a-float? | check if a value is a float |
| to-float | convert something into a float |
| to-float | convert something into a float |
| float-to-integer | convert a float to an integer |
| float-to-text | convert a float to a text |
| float-add | add two floats |
| float-subtract | subtract two floats |
| float-multiply | multiply two floats |
| float-divide | divide two floats |
| float-remainder | remainder of two floats |
| float-power | power of two floats |
| float-sqrt | square root of a float |
| float-sin | sine of a float |
| float-cos | cosine of a float |
| float-tan | tangent of a float |
| float-asin | arc sine of a float |
| float-acos | arc cosine of a float |
| float-atan | arc tangent of a float |
| float-log | natural logarithm of a float |
| float-exp | exponential of a float |
| float-floor | floor of a float |
| float-ceiling | ceiling of a float |
| float-round | round a float |
| float-truncate | truncate a float |
| text-join | text concatenation operator |
| & | text concatenation operator, see text-join |
| text-cut | extract a cut of a text, remove a suffix |
| text-length | length of a text |
| text-but | remove a prefix from a text, keep the rest |
| text-mid | extract a part of the text |
| text-low | convert a text to lower case |
| text-up | convert a text to upper case |
| text=? | compare two texts |
| text<>? | compare two texts |
| text-find | find a piece in a text |
| text-find-last | find a piece in a text |
| text-line | extract a line from a text |
| as-text | textual representation |
| dump | textual representation, debug style |
| ""? | unary operator |
| ""? | unary operator - true if TOS is the empty text |
| named? | operator - true if NOS's name is TOS tag |
| peek | Get the value of a cell, using a cell's address. |
| poke | Set the value of a cell, using a cell's address. |
| make-constant | using a value and a name, create a constant |
| tag-defined? | true if text described tag is defined |
| defined? | true if text described verb is defined |
| make-global | create a global variable and verbs to get/set it |
| make-local | create a local variable in the control stack |
| return-without-parameters | internal |
| run-with-parameters | run a block with the "function" protocol |
| local | copy a control variable to the data stack |
| set-local | assign a value to a local variable |
| data | lookup for a named value in the data stack and copy it to the top |
| set-data | change the value of an existing data variable |
| size-of-cell | constant that depends on the platform, 8 for now |
| lookup | find a variable in a memory area. |
| upper-local | non local access to a local variable |
| upper-data | non local access to a data variable |
| set-upper-local | set a local variable in the nth upper frame |
| set-upper-data | set a data variable in the nth upper frame |
| without-data | remove stack elements until a previous variable, included |
| make-fixed-object | create a fixed size object |
| make-object | create a object of the given length |
| extend-object | turn a fixed object into an extensible one |
| object-get | access a data member of an object |
| object-set | change a data member of an object |
| stack-push | push a value onto a stack object |
| stack-drop | drop the top of a stack object |
| stack-drop-nice | drop the tof of a stack object, unless empty |
| stack-fetch | get the nth entry of a stack object |
| stack-fetch-nice | get the nth entry of a stack object, or void |
| stack-length | get the depth of a stack object |
| stack-capacity | get the capacity of a stack object |
| stack-dup | duplicate the top of a stack object |
| stack-clear | clear a stack object |
| stack-swap | swap the top two values of a stack object |
| stack-swap-nice | like swap but ok if stack is too short |
| stack-enter | swith stack to the stack of an object |
| stack-leave | revert to the previous data stack |
| data-stack-base | return the base address of the data stack |
| data-stack-limit | upper limit of the data stack |
| control-stack-base | base address b of the control stack |
| control-stack-limit | upper limit s of the control stack |
| grow-data-stack | double the data stack if 80% full |
| grow-control-stack | double the control stack if 80% full |
| queue-push | add an element to the queue |
| queue-length | number of elements in the queue |
| queue-pull | extract the oldest element from the queue |
| queue-capacity | maximum number of elements in the queue |
| queue-clear | make the queue empty |
| array-put | set the value of the nth element |
| array-get | nth element |
| array-length | number of elements in an array |
| array-capacity | return the capacity of an array |
| map-put | put a value in a map |
| map-get | get a value from a map |
| map-length | number of elements in a map |
| set-put | put a value in a set |
| set-get | access a set element using a tag |
| set-length | number of elements in a set |
| set-extend | extend a set with another set |
| set-union | union of two sets |
| set-intersection | intersection of two sets |
| without-local | clear the control stack downto to specified local |
| return-without-locals | like return but with some cleanup |
| with-locals | prepare the control stack to handle local local variables |
| return-without-it | internal, run-with-it uses it |
| with-it | prepare the control stack to handle the 'it' local variable |
| it | access to the it local variable |
| it! | change the value of the it local variable |
| run-method-by-name | using a text to identify the method |
| run-method-by-tag | using a tag to identify the method |
| run-with-it | like run but with an "it" local variable |
| words_per_cell | plaftorm dependent, current 1 |
| CSP | Constrol Stack Pointer, address of the top of the control stack |
| set-CSP | move the top of the control stack |
| TOS | address of the top of the data stack |
| set-TOS | move the top of the data stack to some new address |
| IP | access to the instruction pointer where the primitive was called |
| set-IP | jump to some address |
| inox-dialect | switch to the Inox dialect |
| dialect | query current dialect text name |
| forth-dialect | switch to the Forth dialect |
| set-dialect | set current dialect |
| alias | add an alias to the current dialect |
| dialect-alias | add an alias to a dialect |
| import-dialect | import a dialect into the current one |
| literal | add a literal to the Inox verb beeing defined, |
| machine-code | add a machine code id to the verb beeing defined, |
| inox | add next token as code for the verb beeing defined, |
| quote | push next instruction instead of executing it. |
| immediate | make the last defined verb immediate |
| hidden | make the last defined verb hidden |
| operator | make the last defined verb an operator |
| inline | make the last defined verb inline |
| last-token | return the last tokenized item |
| tag | make a tag, from a text typically |
| run-tag | run a verb by tag |
| run-name | run a verb by text name |
| run-verb | run a verb by verb id |
| definition | get the definition of a verb |
| run | run a block or a verb definition |
| run-definition | run a verb definition |
| block | push the start address of the block at IP |
| block | push the start address of the block at IP. |
| start-input | start reading from a given source code |
| input | get next character in source code, or "" |
| input-until | get characters until a given delimiter |
| pushback-token | push back a token in source code stream |
| whitespace? | true if TOS is a whitespace character |
| next-character | get next character in source code, or "" |
| digit? | true if the top of stack is a digit character |
| eol? | true if the top of stack is an end of line character |
| next-token | read the next token from the default input stream |
| set-literate | set the tokenizer to literate style |
| integer-text? | true if text is valid integer |
| parse-integer | convert a text to an integer |
| compiler-enter | Entering a new parse context |
| compiler-leave | Leaving a parse context |
| compile-definition-begin | Entering a new verb definition |
| compile-definition-end | Leaving a verb definition |
| compiling? | Is the interpreter compiling? |
| compiler-expecting? | Is the compiler expecting the verb to define? |
| compile-literal | Add a literal to the verb beeing defined |
| compile-verb | add a verb to the beeing defined block or new verb |
| compile-quote | avoid executing the next token, just compile it |
| compile-block-begin | Start the definition of a new block |
| compile-block-end | Close the definition of a new block |
| eval | Run from source code text coming from the default input stream |
| eval | evaluate a source code text |
| trace | output text to console.log(), preserve TOS |
| inox-out | output text to the default output stream |
| trace-stacks | dump user friendly stacks trace |
| ascii-character | return one character text from TOS integer |
| ascii-code | return ascii code of first character of TOS as text |
| now | return number of milliseconds since start |
| instructions | number of instructions executed so far |
| the-void | push a void cell |
| memory-visit | get a view of the memory |
| source | evaluate the content of a file |