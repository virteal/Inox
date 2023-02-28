# The Iɴᴏx programming language
"Programming, with style."

"Le style, c'est l'homme" - Buffon, 1753.


Iɴᴏx is a concatenative script language. It is designed to operate in the context of edge computing, with the Internet of Things, in Machine Learning times.

It will hopefully run on nodejs (first), wasm (second), micro controlers (esp32), etc.

It is a forth/smalltalk/erlang inspired stack based language with a virtual machine. The basic data element is a 64 bits cell made of two parts, a typed value and a name.

This is the Typescript reference implementation. It defines the syntax and semantic of the language. Production quality versions of the virtual machine would have to be hard coded in some machine code to be more efficient.

I started working on it in june 2021. It's not working yet. The first implementation will run in a regular javascript virtual machine, nodejs, browsers, deno, etc.

Yours,

   Jean Hugues Noël Robert, aka Virteal Baron Mariani. @jhr on Twitter.

---
---
---

Why?
====

Keep reading only if you care about programming language design. You've been warned. Welcome.

The _grand plan_ is an AI driven distributed system, a computerized living organism that evolves according to the _law of evolution_.

The Iɴᴏx programming language explores hopefully innovative features not found in mainstream languages like Javascript, C, Python or PHP. Some of Iɴᴏx specificities do exist in some more esoteric languages like Lisp, Forth, Smalltalk, etc. Some other specifities are radically new. Well... until proven otherwise that is ;)

So, what's new?

Named values
------------

Every Iɴᴏx value has a name attached to it. That name comes in addition to the classic type and value that most languages provide.

Because values are named, using a tag, it becomes possible to access them using that name. This is similar to the indirect access that pointers provide but without the notion of identity normaly associated to objects. That is so because many values can have the same name whereas the identity of an object is unique.

This is similar to the notion of property, attribute, field, instance variables, etc. But it has deep additional consequences and usages.

Among other usages, Iɴᴏx uses names to access variables in stacks. Most other languages use index instead, ie a numercial position in the stack. A position that is most often relative to the level of the stack when some function is entered/activated. These are the classical notions of activation records and local variables associated to function calls.

Because Iɴᴏx access variables by names there is no need to provide a user friendly syntax to figure out the numerical position of a variable in a stack. Hence local variables in Iɴᴏx are dynamically scoped; no lexical scope, not yet.

Iɴᴏx also uses named values to implement control structures (if, loop, etc) without the computation of complex changes to the instruction pointer. It is still possible to manipule that instruction pointer to implement diverse form of branching (goto, jump, call, exceptions, etc) ahead of time, at _compile time_, when verbs are defined, but this is more an optimization than a natural way of expressing things using names instead of labels like in the dark age of assembler languages.

An Iɴᴏx optimizing compiler is somewhere is the road map, we'll come to it somedays, just in time.


A tale of two stacks
--------------------

Iɴᴏx don't mix the _control plane_ with the _data plane_, contrary to most languages.

The good thing about that is that data can stay much longer in the stack instead of needing storage elsewhere.

For example the idiomatic solution to build an array is to push some sentinel value onto the _data stack_, accumulate data on it thanks to some processing and collecting all the data down to the sentinel data when the data is ready for further processing somewhere else or sometimes later.

This is incredibly usefull and when more stacks are required it is equaly simple: switch to a new stack, build the data, store the result somewhere (or leave it on the alternative stack) and get back to the previous stack, eventually the original data stack.

Sophisticated _statefull machines_ can be expressed easly using that solution in addition to _finite state machines_. It's like having an instruction pointer for data instead of the usual one for code, complete, with push, pop, and return. Think 'active data'.

All objects have at least one data stack attached to them. _Actors_ are special active objects that can have multiple data stacks so that it is possible to send them messages to different addresses, as if they had multiple mailboxes.

Sending messages to the main _data stack_ of an _actor_ is asking it to process the message. Sending the message to some other data stack of the actor helps the actor to identify the meaning of the messages it receives.

Sending messages to the _control stack_ of an _actor_ is even more strange, it's basically telling the actor what verbs to execute, ie remote control. This could for example ask the actor to change state, switch to a debug mode for example or prepare for an _hot reload_ when some change in the code needs to occur.

Note that an _actor_ has full control over the routing of the messages it receives, it can dispatch them to some stack or queue them until it reaches some different state.

None of this _actor_ stuff is implemented at this time, this is a work in progress.


Reactive sets
-------------

_Actors_ also handle enhanced stacks dedicated to the processing of a very powerfull type of structured datum called _reactive sets_.

Thanks to the Toubkal dataflow engine, such data sets can travel thru multiple processing steps in a fully distributed and consistent manner. This is stream processing on steroïds.

The vision is to have captors and reactors down to small devices like a smart bulb or a smoke detector in the house and up to massive AI enhanced processors that could make decisions based on changing external conditions.  Conditions like the weather for example when controlling the usage of electricity in a plant factory or even in a house with solar panels.

On a large scale this is like a giant brain with neurons of diverse power that react to changing inputs by firing intelligently depending on their configuration and training capabilities, small and big.


Hints
-----

Interpreters are slow, this is inevitable to some extend. That disadvange is compensated by some additionnal level of safety. No more dangling pointers, overflow/underflow, off by one back doors, eisenbugs that disappear when observed and all the drama of low level debugging, core dumps, viruses and unanticipated corner cases. Less pain.

Yet, no pain, no gain. If you dare, Iɴᴏx lets you enter adventure land. You then giveup asserts, type checking, boundaries guards and maybe even dynamic memory management in exhange for speed. Up to C speed for those who are willing to take the risk.

Runtime checks are enabled/disabled at user's will, at run time potentially. This provides a speed boost that is well deserved when sufficient test coverage was conducted by the mature programmer using state of art technics.

Type checking at compile time is a mode that sustains the passage of time, it is not going to disappear soon. On the other end of the spectrum, script languages favor late binding and run time type identification. Let's try to unite these opposite styles, to the extend it is possible.

Syntax is also a matter of taste. Iɴᴏx is rather opiniated about that. To some reasonnable extend it provide mechanisms to alter the syntax of the language, sometimes radically. Thank Forth for that.

It is up to each programmer to apply the style she prefers, life is brief. There is more than one way to do it as they say in the wonderfull world of Perl. The principle of least surprise is cautious but girls love bad guys, don't they?

So, be surprised, be surprising, get inspirational if you can, endorse the Iɴᴏx spirit!

Vive Iɴᴏx ! Or else, stay calm and carry on, c'est la vie, a tale maybe.


Overview
========

Here is a short presentation of some of the main characteristics of the Iɴᴏx programming language. There is no stable set of features yet but it gives some ideas about the general spirit of the language.

This introduction is more like a tutorial than a reference manual. That manual will come next, when design gets stable. Enjoy and stay tuned!


Verbs
=====

``` sh
to hello  "hello" out.

hello
```

This defines a **verb** named `hello`. Then the verb is invoked and as a result `hello` is displayed on some output device.

Verbs take their arguments from the _data stack_. They can also push results onto that stack.

Verb `to` starts a verb _definition_ that an often optional `.` (dot) terminates. Inside that defintion there are other verbs and litteral values like numbers or pieces of text.

Note: the name of a _verb_ can be made of anything, not just letters. As a result `even?` is a valid name for a verb, it could be the name of a verb that tests if a number is even. By convention verbs with a `?` suffix are _predicates_, their result is a _boolean value_ that is either true or false.

As a convenience the verb to invoke can be specified before the pushed data, using the `( )` paranthesis. This is the _infix_ notation.

``` sh
say( "hello" )  ~~ "infix" style
"hello" say     ~~ "postfix" style
```

It is the responsabily of whoever invokes a verb to first push onto the stack the arguments required by that verb, in the proper order, in the proper number, etc. Each verb can define it's own _protocol_ about that. There are a few common protocols, described below.


Control structures
==================

 ``` sh
to play
  random-no( 100 )
  loop: {
    out( "Guess? " )
    read-line, text-to-integer,
    dup, if not integer? then: { drop,               continue }
    dup, if: >?          then: { out( "Too big"   ), continue }
    dup, if: <?          then: { out( "Too small" ), continue }
    out( "Yes!" ), break
  }
  clear
```

This code is a small game where the player must guess a number between 0 and 100. It illustrates two important _control structures_: _loops_ and _conditionnals_.

`dup` duplicates the value on the top of the data stack whereas `drop` removes it, while `clear` empties the entire stack.

`while: { ... } do: { ... }` and `do: { ... } until: { ... }` are special versions of the more general `loop: { ... }` structure where the loop breaks or continues depending on some condition.


Functions
=========

Functions are special verbs with named _parameters_ to access _arguments_ in an easier way than is possible from the data stack. They respect the _function protocol_.

``` sh
to tell-to/  with /msg /dest  function: {
  out( "Tell " & msg> & "to " & dest> )
}

tell-to/( "Hello", "Alice" )
```


By convention the names of functions terminates with a `/` that means _applied on_. When the function is invoked, it's actual arguments are moved from the _data stack_ onto another stack named the _control stack_. In the process these values get renamed so that the names of the actual arguments get's replaced by the names of the formal parameters.

The `{}` enclosed _block_ that defines the function can then access the arguments, using the name of the corresponding formal parameter with a `>` suffix. This is the syntax for _local variables_ too.

`&` is an operator that joins two pieces of text found on the top of the stack.


```
to tell-to/  with /m /d, /{ out( "T " & m> & "t " && d> }
```

This is an abbreviated syntax that is defined in the _standard library_. `xx{ ... }` is like `xx( ... )` but the former invokes the `xx{` verb with the block as sole argument whereas the later invokes the verb `xx` when `)` is reached.

`/{` is like `{`, it marks the begining of a _block_, a sequence of verbs and literals. There is however an important difference, only `/{' creates a new _scope_. This is convenient to use _local variables_ that will be automaticaly discarded when the block execution ends.

In the case of `/{` the _scope_ is filled with local variables that are the formal parameters of the function. The _scope_ and all the local variables in it is discarded when the function returns.

There is also a `.{` that is like `/{` but it creates a new scope with a single local variable named `it` that is the target of the operations in the block. When the target is not an object, but rather a value, then the synonym `>{` makes more sense (`it{` is another option, same meaning).

Some high level _control structures_ automaticaly create a scope. This is the case for all types of _loops_ and anything related to _exceptions_.


Assertions
==========

```
assert{ check-something }
```

Assertions are conditions to expect when things go normally, ie with no bugs. Assertions before something are called _pre conditions_ whereas assertions after something are called _post conditions_. This is usefull to detect bugs early.

Note: the verb `assert{` does not evaluate it's block argument when running in _fast mode_. Hence there is little overhead involved to keep lots of assertions even when the code is ready for production. Who knows, they may prove valuable later on when some maintenance error breaks something. It's like tests, but inline instead of in some independant test suite.

The default definition of `assert{` uses the `inox-FATAL` primitive. However it uses it via an indirection by the `FATAL` verb so that the behaviour can be redefined freely by redefining that verb.


Verb redefinition
=================

``` sh
to FATAL  /FATAL-hook call-by-tag.  ~~ late binding
```

This kind of _late binding_ makes it easy to hook some new code to old verb definitions. Without those indirections there would be no solution for old verbs to use redefined verbs.

That's because redefined verb definitions impact verbs defined after the redefinition only, ie the existing verbs keep using the older definition.

``` sh
to FATAL-hook handle-it-my-way.
```

The default implementation in the _standard library_ uses `inox-FATAL`. That primitive displays a stack trace and then forces the exit of the Iɴᴏx process. This is brutal but safe when Iɴᴏx processes are managed by some _orchestration_ layer. A layer that will automatically restart the dead process for example.


Blocks
======

Blocks are sequences of _verbs_ enclosed between balanced `{` and `}`.

``` sh
to tell-sign  if-else( <0?, { out( "negative" ) }, { out( "positive" ) }.

-1 tell-sign  ~~ outputs negative

tell-sign( -1 )  ~~ idem, infix style`
```

Two consecutive `~~` (tildes) introduce a comment that goes until the end of the line. Use `~|` and `|~` for multi lines comments.


Exceptions
==========

There exists two main styles about _exceptions_. _fail fast_ is about aborting as soon as something exceptional occurs. It is the simple idea that there is some _orchestration_ layer that will detect the situation and decide to automally restart the failing processus when appropriate.

The other style is about trying to recover, ie assuming that the exception is rare but not that much exceptionnal. This is good if the handling of the exception is safe because it was well anticipated.

```
to save-data
  try: {
    ~~ attempt to save somehow
  } catch: {
    ~~ attempt to handle something rare
  } finally: {
    ~~ things to do in both cases, success and failure
  }
```

Both `finally` and `catch` blocks are optional. There is some _overhead_ when exceptions are handled because a new _scope_ is involved, it is small but noticable when utter speed matters.

When the _catch_ block runs, it has access to the stacks, both the _data stack_ and the _control stack_. There are two options. Either the exception is _recoverable_ and in that situation the exception does not need to propagate because the program aborts. Or the exception needs to be propagated further using `raise`.


Keywords
========

```sh
to say:to:  "-" joint-text, out().

say: "Hello" to: "Bob";  ~~ outputs Bob-Hello
```

Keywords are multi parts verbs with a `:` (colon) after each part and a final `;` (semi colon). This is _syntactic sugar_ to make the source mode readable.


```sh
to tell-sign
  if: <0? then: {
    out( "negative" )
  } else: {
    out( "positive )
  }
```

`if:then:else:` is a keyword. It is predefined. If it were not, it could easly be defined using the `if-else` verb.

``` sh
to if:then:else  ~| cond block block -- |~
~~ run first or second block depending on condition
  if-else
```

`if-else` is a verb that expects to find three arguments on the data stack: a _boolean_ value and two _blocks_. Depending on the boolean, it runs either the first or the second block.

``` sh
to tell-sign  <0? { "negative" out } { "positive" out } if-else.
```

This definition of the verb `tell-sign` uses a style that is unusual, it is a _postfix_ notation. This is compact but sometimes difficult to read. Depending on your preferences you may use either that _postfix_ style, a classical _infix_ function call style or the multi parts _keyword_ style.

The form changes but the meaning keeps the same.


Variables
=========

Global variables
----------------

```
variable: /global-state is: "initial state".
constant: /error-state  is: "error".

loop: {
  if: global-state =? error-state then: { break };
  ....
  if: xxx then: { "next" global-state! };
  ...
}
```


There are automatically two verbs that are created for each global variable. First verb is the _getter_ verb, which is simply the name of the variable as specified when the variable was created using a tag. The second verb is the _setter_ verb, the same name with the `!` _suffix_.

Constants are like variables but with no _setter_ verb. Once set, at creation, the value cannot change anymore.

Note that `constant: /error-state is: "error".` just means `to error-state "error".`, _syntactic sugar_ again. Which form you use depends on the style you prefer.


Local variables
---------------

``` sh
to say-to  >{ >msg
  out( "Say " & msg> & " to " & it )
}

say-to( "Hello", "Bob" )  ~~ outputs Say Hello to Bob
```

Local variables are variables stored into another stack, the _control stack_. Syntax `>xyz` creates such variables using values from the top of the _data stack_. It reads _"create local variable x"_. Use syntax `xyz>` to retrieve the value of the local variable. It reads _"get local variable x's value"_.

To set the value of a local variable using the top of the stack, use `>xyz!`. `!` (exclamation point) means "set" in this context and by convention it means _"some side effect or surprise involved"_ is a more general sense.

``>{`` and `}` specify respectively the begining and the end of the **scope** within which local variables are created and used. These scopes can nest in such a way that a local variable created by a verb can be accessed from the other verbs invoked while the scope exists, unless that verb created another local variable with the same name.

This type of scoping for variables is named _"dynamic"_ by opposition to the more frequent static style named _"lexical"_ where a local variable stays purely local to the function that created it. Note: changing the value of a local variable outside the verb that created it is usually considered _"harmful"_ and should be avoided.


Object variables
----------------

**Object variables** are stored inside the stack that belongs to an _object_. Every object has an identity and a value that is a stack of values. The name of that stack is the _class_ of the object. The names of the values in the object's stack are the names of the _attributes_ of the object.

Note: the OOP (Object Oriented Programming) literature uses many names for that concept: _fields_, _properties_, _attributes_, _instance variables_, _members_, etc. They all mean the same.

```
x:3 y:2 point:2 make-object  ~~ create a point object with two attributes.
```

Access to an object's variables requires two informations: the name of the variable and the identity of the object. The identity is _reference_ to the object, not the object itself.

The `make-object` verb creates an object and pushes it's identity onto the data stack. It gets as parameters the **class** of the object and the number of object variables to initialize with values poped from the data stack.

```
to make-point  make-object( x:0, y:0, point:2 )

make-point, 2 _point.x!, 5 _point.y!, out( "x is " & _point.x )
```

With the object class and the object variable, it becomes easy to define **method verbs** that manipulate the object.

```
to point.dump  method: { out( "( x:" & it.x & ", y: " & it.y & ")" ) }.
```

Such method verbs are typically defined using the `method:` verb. It creates a _scope_ and a local variable named **it** and then it runs the specified block. Some other language use _self_ or _this_ instead of _it_.


Data variables
--------------

Data variables have their value stored in the _data stack_. To retrieve such a value it should first be pushed with a proper name and then later on retrieved using that name with a `_` prefix.

``` sh
x:3 y:5
out( "Point x: " & _x & ", y: " & _y )  ~~ outputs Point x:3, y:5

10 _x!
out( "Point x: " & _x & ", y: " & _y )  ~~ outputs Point x:10, y:5
```

To push such a data variable onto the data stack, it's initial value can also be taken from the top of the data stack itself using the syntax `xyz_`. It reads _"store the top of the data stack into data variable xyz"_ or _"rename xyz the value at the top of the data stack"_.

```
3 x_
out( "Hello" & _x )  ~~ output Hello3
```

Note that values stays on the _data stack_ until some verb _consume_ them. When extra values remain, you may empty the stack down to some named value using `/some-name without-data`.


Values
======

Values are simple things such as `1`, `"hello"`, `/msg` or the identity of some object, or some more complex values, made of multiple simple values.

Every value, either simple or complex, has a type and a name attached to it. These **named values** are often more convenient to manipulate than the classical anonymous values found in most computer languages.


Falsy values
------------

There is a `boolean` type of value with only two valid values, `true` and `false`.

There are a few special values, _falsy_ values such as `0`, `void` or `""` (the empty text) that are often usefull when a _boolean_ value is expected. To check if a value is _falsy_ use the `?` operator. It's result is either `true` or `false`.


```
if: "" then out( "true" )      ~~ => type error, "" is not a boolean value
if: "" ? then out( "true" )    ~~ nothing, "" is falsy
if: void then out( "true" )    ~~ => type error, void is not a boolean
if: void ? then out( "true" )  ~~ nothing, void is falsy
```

Verbs that expect a _boolean_ value will sometimes _coerce_ the value of an unexpected type into a _boolean_ value, using a very simple rule : everything is true. This is rarely something usefull and using `?`and the _falsy_ logic generaly makes more sense. But it is fast.

Constants are verbs that push a specific value onto the data stack, like `true`, `false` and `void` that push `1`, `0` and `void` respectively.

`void` is a very special value that often means that there is no valid value available. It could be the result of the failed attempt to find something for example.

To test against `void` use the `something?` predicates. It's result is `false` only when the value on the top of the stack is the special ``void`` value. The opposite predicate is `void?` ('nothing?' is a synonym).


Tags
====

```
x:1  ~~ an integer value named x

msg:"hello"  ~~ a text value name msg
```

It is as if a tag were attached to the value, hence such names for values are called **tags**.

``` sh
"rectangle" /label rename, dump out ~~ outputs label:"rectangle"
```

`/xxx` is the syntax to designate a tag. `"xxx"` designates a text. `1.0` or `1f` designate floating numbers. `-1` is the number negative one.

`#xxx` and `xxx/` are two additional syntaxes for tags. Which styles you use is up to you.

Whereas objects have a life cycle (created, used, forgotten), tags exists forever, like numbers, like any value actually, in abstraction. To turn a text into a tag, use `tag( text )`. Use `tag-to-text( tag )` to do the opposite. Some computer languages use a different terminology like _atom_ or _symbol_ but it means the same thing.

Objects have a value and an identity. The value is made of the class of the object and it's variables stored in a stack that belongs to the object. Contrary to values, object are referenced indirectly using **references**. A reference is a type of value that holds the identity of some object.


The class hierarchy
===================

Every thing is something, hence **thing** is the base class of everything else, both values and objects. Values have a name and a type whereas objects have an identity and a value also made of more or less simple multiple values (object variables), potentially including reference values when objects references each others. By convention the name of the value of a object is named it's _class_.

```
class( xxx> )  ~~ get the class of the thing in the xxx local variable.
```

- `thing`
  - `value`
    - `void`
    - `tag`
    - `integer`
    - `float`
    - `text`
    - `reference`
    - `verb`
   - `object`
     - `native`
     - `proxy`
     - `array`
     - `map`

Sometimes some things have a class that is the combination of multiple base classes. For example a text and an array are both iterable things even thougth one is a value whereas the other one is an object made of multiple values. To avoid extra complexity Iɴᴏx provide a single inheritance default solution.

As a consequence `class( something )` produces a single tag, the name of the class of the thing considered. Verb `ìmplements?( thing, /method )` tells about the existence of said method for the class of said thing. By default things implements their own methods and inherit the method of their _super class_, ie the class they _extend_.

That basic solution is extensible by defining a `my_class.method` that is free to lookup for the desired method the way it wants. See also `.missing-method` about _virtual methods_ whose definition is determined _on the fly_ at _run time_, a sometimes slow but otherwise radically flexible solution.

There are some optimizations involved to speed up the method lookup using caches to avoid multiple lookups for the same combination of class name and method name. This is optional and when it is turned on for a class is the responsability of that class to properly invalidate the cache when appropriate.

One important distinction is when comparing two things. If both things are compared _by value_ then the _=?_ operator should be invoked. If things are objects, it is generaly the identity that matters and the _==?_ operator should be invoked. This is _by reference_ instead of _by value_. When communicating, two entities must agree on weither they communicate informations by value or by reference.


Stacks
======

_stacks_ are lists of values with an easy access to the value at the top of the stack or nearby.


The data stack
--------------

The _data stack_ is of special importance because it is throught it that the information flows from verbs to verbs.

Most of the time verbs operate on the values at the top of stack, including the one at the very top sometimes called _"TOS"_, short for Top Of the Stack. The next value, below the top, could be _"NOS"_ for Next On Stack.

Operators are verbs that typically use TOS (unary operators) and sometimes TOS and NOS (binary operators) to produce a result.

```
3 2 + out  ~~ outputs 5

out( 3 + 2 )  ~~ Idem, with an "infix" notation instead of "postfix"
```

It is very common and advised to break long verbs into smaller verbs with good names. This makes the source code easy to understand. Verbs must be defined before they are used. As a result it is common to first define verbs for some special vocabulary and then use these simple verbs to solve a bigger problem.


Handling the data stack
-----------------------

It takes some practice to get used to it and some people simply won't try: handling the data stack is like juggling with the values on the stack, it's a mental martial art.

``` sh
to say:to:
  ", To: " swap join-text
  swap
  "Say:" swap join-text
  join-text
  out

say: "Hello" to: "Bob";  ~~ outputs Say: Hello, To: Bob
```

`swap` is a predefined verb that swaps the value at the top of the data stack with the next value on that stack.

```
to say:to:   ~| msg dest -- |~
  ", To: "   ~~ msg dest ", To:"
  swap &     ~~ msg ", To: {dest}"
  swap       ~~ ", To: {dest}" msg
  "Say: "    ~~ ", To: {dest}" msg "Say: "
  swap &     ~~ ", To: {dest}" "Say: {msg}"
  &          ~~ "Say: {msg}, To: {dest}"
  out        ~~

say: "Hello" to: "Bob";  ~~ outputs Say: Hello, To: Bob
```

`over` is like `dup` but it duplicate NOS instead of TOS, ie it duplicates the next value on the stack instead of the top of stack value. Juggling with values on the stack gets tricky easely. That's why it is sometimes usefull to describe the _protocol_ of a _verb_ with special comment about their _effect_ on the stack.

Here are such comments for the most common verbs to handle the top values of the data stack:

``` sh
dup    ~| a -- a a |~
drop   ~| x -- |~
swap   ~| a b -- b a |~
over   ~| a b -- a b a |~
rotate ~| a b c -- b c a |~
```

Fortunately you can avoid doing that if you want, using _local variables_, _functions_ and _methods_.


The control stack
-----------------

The _control stack_ is for _control structures_ like loops, conditional branches or nested verb invocations. It is also used to store _local variables_ like for instance an `ii` variable that is used as an indice when adressing the elements of a list of values or similar data structures.

When the definition of a verb requires the execution of another verb, or the application of a function, as most verbs do, the position inside the current verb is stored onto the control stack. It is later retrieved there when the execution of the nested verb is finished and when control needs to get back to the previous verb.

Note: this usage of the control stack is so frequent that most languages call it _the return stack_ instead.


Stack protocol
--------------

Verbs agree on protocols to manipulate values on the data stack. The most basic, fast and fairly accrobatic protocol is the _stack protocol_. With that protocol it is the order of the arguments on the stack that matters.

```
to fib
  dup
  if: >? 2 then: {
    dup, fib( - 1 ) + fib( swap - 2 )
  }

out( fib( 10 ) )  ~~ outputs the 10th number of the fibonacci suite
```

In this example, `dup` duplicates the TOS (Top Of the Stack) and `swap` swaps it with the NOS (Next On Stack). Dealing this way with the stack can become rather complex quickly and using functions produces a solution that is more readable (but sligthly less fast).


Function protocol
-----------------

This protocol is very common in most programming languages. It states that _functions_ get _parameters_ thanks to _arguments_ that the _caller_ function _provides_ to the callee function. That function is then expected to _consume_ these arguments in order to produce one or more results.

```
to fib/  with nth/
~~ Compute the nth number of the Fibonacci suite
  function: {
    if nth> >? 2 then: {
      fib/( nth> - 1 ) + fib/( nth> - 2 )
    } else: {
      nth>
    }
  }
 ```

This definition of the fib verb is _recursive_ because it references itself. If the current verb were the last verb of it's definition, using `again` instead would be a better solution because it avoids a potential overflow of the control stack. This classic optimisation is called _"tail call elimination"_ and it is done by the Iɴᴏx compiler (ToDo).

Unfortunately it does not apply to the fidonacci function because the actual last verb of the definition is the `if` verb. This is clearly visible in the postfix notation only.

```
to fib
  dup
  2 >? {
    dup,  1, -, fib
    swap, 2, -, fib
    +
  } if
```

Note: the `,` (comma) is purely cosmetic, it is just there to make the source code clear, somehow.


Named parameters protocol
-------------------------

Another style is possible using named values in the data stack, ie _data variables_ instead of _local variables_.

```
to fib  ~| nth:n ... -- nth:n ... fib:n |~
  ( if: _nth >? 2 then: {
    fib( _nth - 1 :nth ) + fib( _nth - 2 :nth ) )
  } )fib

out( fib( nth:10 ) ) drop  ~~ Now the parameter needs to be named and manualy removed
```

In this example `:nth` _renames_ the TOS (Top Of the Stack). It is necessary to do so because verb `fib` uses `_nth` to get it's parameter. That's a different verb _protocol_ than the ones of the previous definitions of `fib`, it's the `named parameters` protocol.

Verbs often name their result. That way, it becomes easy to get theses results later on from the data stack. Syntax `( ... )something` makes it easy to rename a single result.

When a verb returns multiple results, it should name each of them to respect the _named protocol_, this is just a convention however.

When the results are no longer needed, they can be forgetten, ie removed from the data stack. Syntax `something/without` does that, it removes all the values from the top of the data stack up to the one named `something` included.

Note: The _function protocol_ uses a special version of `without`, named `without-control`, that operates on the _control stack_ instead of the _data stack_. That's because parameters and local variables are stored in the _control stack_, not the _data stack_.


Other stacks
------------

A stack is a fairly usefull data structure and it is easy to create one using an array of values whose size grows and shrinks when values are pushed onto the stack and popped from it.

``` sh
make-stack( 100 ) ~~ at most 100 values
"hello " _stack.push
"world!" _stack.push
out( _stack.pop & _stack.pop )

~~ it outputs world!hello , out( _stack.pop _stack.pop prefix ) would produces hello world! instead.
```

Note: the result of `make-stack` is a _reference_ value named `stack`, this is the reason why `_stack` easely finds it inside the data stack.


Method protocol
---------------

*Methods* are verbs that operate on something, often an object. They do very little but what they do is essential. They figure out the name of a verb based on their own name and the _class_ of the _target_ value that they find on the stack.

Because the name of final verb is determined at _run time_, when the verb is run, not _compile time_, when the verb is defined, this is called _late binding_.

Iɴᴏx is somehow special about methods because methods work both with objects and with values. So much that it is fairly easy to implement the value semantic using objects, the user don't see the difference. A few methods needs to be implemented to handle _cloning_ and _value equality_.

Cloning is about duplicating a value whereas value equality is about determining if two values are actually the same value even if their object representation is different.

The opposite is true also, it is easy to implement the objet semantic of any value, it just needs to be _boxed_, ie put in some object.

``` sh
to text.box              :box text-box:1 make-object.
to text-box.super-class  /value.
to text-box.push         dup >R ( .box swap & .box! ) R>.
to text-box.value        .box.
to text-box.out          .box out.

"Hello" .box       ~~ make a text-box object
.push( " world" )  ~~ add text to it
.push( " !" )
out( .value() )    ~~ output it's value
```

This is a fairly inefficient version of a `text-box` buffer class but it works. Using it one can add text to the buffer until the result is used to output it using `.out()` or to get it's text value using `.value()`.

A more efficient version may accumulate pieces of text inside a list and then join the members of the list when the text value is eventually needed.

There will exist higher level verbs to help define such boxed values and much more, in the _standard librairy_. However, whatever the implementation, at the end it will always be about applying method verbs to objects.

`>R` and `R>` move the TOS forth and back to the _control stack_, this is a simple solution to save something and restore it later. In the example, it is the reference to the text-box object that is saved and restored. By convention method verbs that don't provide a result should simply provide back the reference they were provided. That reference is the _target_ of the method. This is part of the _method protocol_.

Note: the _target_ of a _method_ does not need to be a _reference_ to an object, it can also be any other type of value. As a result _methods_ are ok for both types of values, builtin types and user defined object classes.


Stack shorthands
----------------

Because accessing variables the stacks is frequent, there are shorthands to do it, both to get values and to set values.

Here are the short forms and the corresponding longer forms:

```sh
_d   ~~ /d data           ~~ get the value of the d data variable
_d!  ~~ /d set-data       ~~ change the value of the d data variable
>c   ~~ /c make-control   ~~ initialize a new c local variable
c>   ~~ /c control        ~~ get the value of the c local variable
>c!  ~~ /c set-control    ~~ change the value of the c local variable
```

To assign the value of a local variable to another one the shorthand is ``a> >b!``. The `!` is there to remind that this is a _side effect_. Whenever possible, it is better to create a new local variable instead of changing an existing one, this is easy: `a> >b`. The absence of `!` signals that the assignment does not _mutate_ anything. Avoiding mutations is often a good idea to avoid bugs.


Modules
=======

There is no concept of _module_ per see at this point but this will come later. For now the solution is to encapsulate verbs into some _pseudo class_ and use `some-module.some-verb()` to avoid collisions with verbs named identically in other modules. Alternatively one may use `some-module_some-verb` or any other separator like ``some-module::some-verb`. Until better.

Note that using `class.some-verb()`and `class.some-verb` do not produce the same result because the second form only returns the verb, it does not exeute it. To execute the verb, use syntax `class.some-verb definition run` or shorter `class.some-verb run-verb`.


File formats
============

Source code is the prefered format, utf-8 encoded unless otherwise specified. Extended characters are valid in text literals only. All identifiers should be visible ASCII, ie in the 33 to 126 range.

The default dialect is the simple `forth-dialect` unless some initial comment tells otherwise. The two very first characters must be treated differently, in the unix tradition, ie _shebang_ style with `#!`.

File names should use the `.nox` extension.

Compiled code file should starts with a small header that is compatible with the _shebang_ unix tradition if the file is an executable file. The version number comes next, in text format, on a new line. Then comes the type of the file and the name of the encoding, on new lines too.

Compiled code files should use the `.xnx` extensions.

Special header `forth-dialect`, in place of the version number, means that the forth dialect needs be used to run the file so that it is the file itself that will determine what to do with the rest of itself. Rational: on small embedded systems only the forth-dialect may be available, for space reasons.


Versioning
==========

“The only constant in life is change.”- Heraclitus

There will be multiple versions of the Iɴᴏx programming language and it is better to anticipate about that in order to ensure backward compatibily of any old source code when a new major version of the language is introduced.

This is why all source code _should_ start with an assertion about the minimal version of the language it expects.

```
inox-1
```

The `inox-2` verb will be predefined when the version 2 of the language is released. Using it with a version one Iɴᴏx machine will raise a fatal error.

To know about the current version of some Iɴᴏx virtual machine, use `inox-version`. It provides a version number in the major.minor.patch format. Use `inox-version-time` to get the time when the version was released. It can be compared with the current time `inox-time-now` or any other date in that format, the date of the last change to a source code file for example.

Using `inox-assert-version` and/or `inox-assert-version-time` the source code can assert the older version it was tested against or the date of that version. It is expected that all new versions of the Iɴᴏx machine will do their best to adapt to the version of the source code.

None of this is available as of today, this is inox-0.


Immediate verbs
===============

To improve speed, use syntax `[ /class.some-verb definition ] literal call` as this will compute the address of the verb _definition_ at _compile time_ instead of _run time_, ie _early binding_ instead of _late binding_.

Or, shorter, use `quote class.some-verb verb-literal`.

`' class.some-verb verb-literal` is even shorter but the quote character is less readable, at least until you get used to it.

When defining a verb, typically after `to some-thing` the Iɴᴏx interpretor switches to a special _compile mode_. In that mode the following verbs are added to the _definition_ of verb being compiled instead of beeing immediately executed.

However, some verbs, _immediate verbs_, also called __defining verbs_, are still immediately executed. These special verbs are typically usefull to compute stuff immediately instead of later on when the verb is invoked.

Together with `verb-literal` and other similar _defining verbs_, this concept of _compile mode_ versus _run time_ makes it easy to define verbs using the result of some computation instead of just adding plain verb names to the definition.

`literal` is one such verb, it adds a literal to the definition. A _literal_ is something like a number, a piece of text, a tag, etc. Ie, it's a simple value. As usual, the literal to add is found on the top of the stack.

To define an _immediate_ verb, simply invoke the `immediate` verb right after the normal verb definition.

```
variable: /profiling is: true;
to profile increment-call#.
to with-profiling
  if: profiling then: {
    inox-verb tag-literal
    /profile  verb-literal
  }
immediate

~~ simple profiling, counts numbers of calls, usage:
true profiling!
to do-it with-profiling do-something.
```

Because ``with-profiling`` is an _immediate_ verb, it is called when the verb ``do-it`` is defined, at _compile time_, not when it is called, not at _run time_.

It then gets the name of the current verb, which is `/do-it`,using ``ìnox-verb``, and then add some code to the definition of that current verb.

Said code will call ``profile`` with the name of the verb as parameter. That `profile` verb would typically increment some counter associated with the verb, this is not shown in the example.

If _global variable_ `profiling` is false, nothing happens, ie no profiling code is added.

Reminder: ``variable: xxx is: yyy;`` creates a _global variable_ with some initial value. It is then possible to get and set the value of that variable. Using `xxx` to get it and `xxx!` to change it.

```
to global-state   "initial-state".
to global-state!  [ /initial-state definition literal ] @!.
```

This example is a tricky way to do what `variable:is:` does safely. It gets the address of the definition of the global-state verb and changes it so that it provides a new value. ``@!```is a super powerfull verb that can change any value anywhere you know of, ie with the proper _address_. It's not a _safe_ verb, use it at your own risk.

Note: changing the definition of a verb this ways is a kind of _self modifying code_. This can be convenient sometimes, rarely, for optimizations typically. Remember the advice: avoid premature optimization. First make it work, then you can make it better.


Dialects
========

Iɴᴏx was designed to be extensible. It supports multiple dialects in addition to it's own dialect. The Forth language was a primary source of inspiration. This is why a Forth dialect is proposed.

``` sh
forth-dialect ( speaks Forth )  : HELLO ." Hello" ; HELLO

inox-dialect ~| speaks Iɴᴏx |~  to Hello  out( "Hello" ). Hello
```

Forth dialect
-------------

Forth is an old language designed by Charles H. "Chuck" Moore in the early seventies. It is a fascinating language, very simple, yet very powerfull.

Much like the Lisp language, also a simple and powerfull language, Forth gave birth to a multide of dialects. Where Lisp dialects are usually based on lists, Forth dialects are based on concatented words.

In that sense, Iɴᴏx is a Forth dialect, with verbs instead of words. The Iɴᴏx parser is way more complex than the Forth one and consequently the Forth syntax is very simple, basic.

A valid Forth definition for a verb is simply a list of verbs separated by some space. Whatever is not a verb is expected to be a litteral value, an integer typically.

The Iɴᴏx Forth dialect is slighly more sophisticated because it manipulates named value instead of memory bits. Besides that significant difference the Iɴᴏx Forth dialect is very close to the latest "standard" dialect, currently Forth 2012.

Iɴᴏx dialect
------------

This is the dialect used by most Iɴᴏx source files. It should be available in all _Iɴᴏx Machines_ but the smaller ones where only the Forth dialect is present, for space reasons.

Note that once compiled, verbs defined with the Iɴᴏx dialect are available in the Forth dialect and vice versa.

As a result a compiled Iɴᴏx file can run on an _Iɴᴏx machine_ with no Iɴᴏx dialect, a small machine, maybe a micro controler with limited ressources.

The Iɴᴏx compiler can also generate a C source file that includes both the Forth dialect and the desired subset of primitives and user defined verbs. Once compiled that C source file can then be run anywhere thanks to the extreme portability of the C language.

As a result, the normal development style is to add primitives and verb definitions to some Iɴᴏx machine and then ask it to generate a kind of clone of itself that can run on some predefined target processor. The generating machine holds the _genotype_ whereas the generated machine is the _phenotype_.

The _grand plan_ is for some AI to generate such genotypes based on very highlevel specifications using combinational technics to improve on existing _genetic programming_ solutions. Using a concatenative language is an obvious advantage in such a situation.

None of this is ready right now, it's just on the roadmap.


Aliases
=======

Whenever a word is detected, if some alias for it exists then the word is replaced by it. This is a very basic form of macro processing of the source code, with substitution. A full macro system, like the one of m4, a super set of C's one, is somewhere in the road map; that or something else.

Until then only `alias` is defined.

``` sh
alias( "Define", "to" )  ~~ assuming I prefer to use Define instead of "to".
```

Each dialect has it's own dictionary of _aliases_ that make it easy to change the source code appearence when needed.

``` sh
inox-dialect, alias( "defn", "to" )
defn Hello-world  ( "Hello" out )
( hello )
```

Contrary to _aliases_, verbs defined in one dialect are available is all the other ones.

To create a new dialect, simply swith to it. Then it is a matter of verbs, methods of object, syntaxic aliases and some advanced technics yet to be fully described.

```
/MyDialEct dialect, alias( "Fun", "to" )
Fun HeLlO  "WorLD" out
HeLlo
```

Note: adding aliases to an existing dialect is not safe, better use your own style, your own dialect. If it is nice enought other may copy it, copying is the best compliment they can make to you.

The same is true for reusable verbs, it's better to encapsultate them in some _module_. If they are good names, they may eventually end up in the _standard library_.


missing-verb
------------

When some dynamic construct attempts to execute an undefined _verb_, `missing-verb` is invoked instead. The stack contains either a tag or a text, depending on how the verb was invoked, by text name or by tag name.

It is then possible to dynamiccaly implement the proper behaviour of the undefined verb.


missing-method
--------------

A _method_ is a verb of a certain class, the class of the thing it is applied against. Such verbs have a syntax with a dot that separates the name of the class from the rest of the name of the verb.

When the target thing does not not understand a verb, `missing-method` is invoked instead. The stack contains the target thing plus a tag or a text about the verb, much like with `missing-verb`.


missing-operator
----------------

_Operators_ are special verbs that help to write code in the infix notation. At this time (january 2023) there is no precedence and only left association. But this is expected to evolve with multiple precedences, right associativity and possibly ternary operators.


Memory management
=================

The initial implementation of Iɴᴏx uses reference counters to free the memory associated to an object when that object is no longer referenced. This is simple.

There are cases where a different solution is preferable or even necessary. That's why other solutions can be implemented to either extend or replace the default solution. This is done at the class level (ToDo).

The memory is made of _cells_ stored in a unique global array.

Each cell is a _named value_. There are verbs to read and write the content of these cells to determine the type, name and value of each one of them: `value` to read the value. `value!` to change it, `type` to get the type, `type!` to change it, `name` to read the name and `name!` to change it. Read verbs require the _address_ of a cell, an integer number. Write verbs require an additional parameter, a value, a type or a name.

Using these verbs is very _low level_ and _unsafe_. It may even be _implementation dependent_ in some cases. There is a _strict_ mode that blocks these verbs, on a per _actor_ basis. This introduces the notion of _trusted actors_ (ToDo).


Actors
======

Actors are active objects that communicate the ones with others using _messages_.

Whereas a passive objects execute locally a verb definition when told to do so and suspend the invoker until done, active objects run verbs in parallel. Sometimes it is inside the same machine, either a virtual Iɴᴏx machine or a physical machine. Sometimes it is inside distant machines, with messages transmitted over a network.

Actors are necessary for distributed computing and usefull for asynchronous programming. They are utilized for both purposes often. Actors receive messages from a queue, their _data stack_, and send messages to other actors that they know about either because they created them or because they knew about them by querying some registry.

Like objects, actors have an identity, a class and variables that define their
_state_. However each actor runs in a different thread of execution. Using objects you play solo, with actors it's an orchestra!


Orchestration
=============

The _grand plan_ is to built an AI driven orchestration solution on top of Iɴᴏx defined actors. Such a control plane would automaticcaly restart failing actors, allocate ressources wisely, control hot reloads and migrations, etc.

This is not at all available yet. Please don't use Iɴᴏx in production.


Conclusion
==========

None yet. _That's all folk!_

BTW: there are many bugs in the sample code, can you spot them?
