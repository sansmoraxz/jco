;; An async export returns the `char` whose code point it is given, through
;; `task.return`, which lifts it from a flat parameter.
(component
  (core func $task-return (canon task.return (result char)))

  (core module $m
    (import "" "task.return" (func $task-return (param i32)))

    (func (export "char-of") (param $code-point i32) (result i32)
      (call $task-return (local.get $code-point))
      (i32.const 0 (; EXIT ;)))

    (func (export "callback") (param i32 i32 i32) (result i32)
      unreachable)
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "char-of") async (param "code-point" u32) (result char)
    (canon lift (core func $i "char-of") async (callback (core func $i "callback"))))
)
