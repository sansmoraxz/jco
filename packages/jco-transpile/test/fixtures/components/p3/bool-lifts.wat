;; Lifts `bool` values from core values other than 0 and 1, each of which the
;; Canonical ABI takes as true: arguments to the sync-lowered `take` and the
;; async-lowered `take-async`, a flat `task.return` result and a list in memory.
(component
  (import "take" (func $take (param "v" bool)))
  (import "take-async" (func $take-async async (param "v" bool)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $take (canon lower (func $take)))
  (core func $take-async (canon lower (func $take-async) async (memory (core memory $libc "mem"))))
  (core func $wset-new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core func $subtask-drop (canon subtask.drop))
  (core func $task-return (canon task.return))
  (core func $return-bool (canon task.return (result bool)))
  (core func $return-bools (canon task.return (result (list bool)) (memory (core memory $libc "mem"))))

  (core module $m
    (import "" "mem" (memory 1))
    (import "" "take" (func $take (param i32)))
    (import "" "take-async" (func $take-async (param i32) (result i32)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))
    (import "" "subtask.drop" (func $subtask-drop (param i32)))
    (import "" "task.return" (func $task-return))
    (import "" "return-bool" (func $return-bool (param i32)))
    (import "" "return-bools" (func $return-bools (param i32 i32)))

    (global $set (mut i32) (i32.const 0))
    (global $pending (mut i32) (i32.const 0))

    (func (export "run") (result i32)
      (call $take (i32.const 0))
      (call $take (i32.const 1))
      (call $take (i32.const 2))
      (call $take (i32.const 0x100))
      (call $take (i32.const 0xffffffff))
      (call $task-return)
      (i32.const 0 (; EXIT ;)))

    (func $call-async (param $v i32)
      (local $status i32)
      (local.set $status (call $take-async (local.get $v)))
      (if (i32.eq (i32.and (local.get $status) (i32.const 0xf)) (i32.const 2 (; RETURNED ;)))
        (then (return)))
      (call $join (i32.shr_u (local.get $status) (i32.const 4)) (global.get $set))
      (global.set $pending (i32.add (global.get $pending) (i32.const 1))))

    (func (export "run-async") (result i32)
      (global.set $set (call $wset-new))
      (call $call-async (i32.const 0))
      (call $call-async (i32.const 1))
      (call $call-async (i32.const 2))
      (call $call-async (i32.const 0x100))
      (call $call-async (i32.const 0xffffffff))
      (call $settle))

    ;; Returns once no call is pending, or waits for the next one to.
    (func $settle (result i32)
      (if (global.get $pending)
        (then (return (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (global.get $set) (i32.const 4))))))
      (call $task-return)
      (i32.const 0 (; EXIT ;)))

    (func (export "callback") (param $event i32) (param $subtask i32) (param $status i32) (result i32)
      (if (i32.ne (local.get $event) (i32.const 1 (; SUBTASK ;)))
        (then unreachable))
      (if (i32.eq (local.get $status) (i32.const 2 (; RETURNED ;)))
        (then
          (call $subtask-drop (local.get $subtask))
          (global.set $pending (i32.sub (global.get $pending) (i32.const 1)))))
      (call $settle))

    (func (export "bool-of") (param $bits i32) (result i32)
      (call $return-bool (local.get $bits))
      (i32.const 0 (; EXIT ;)))

    (func (export "bools") (result i32)
      (i32.store (i32.const 16) (i32.const 0xff020100))
      (call $return-bools (i32.const 16) (i32.const 4))
      (i32.const 0 (; EXIT ;)))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "mem" (memory $libc "mem"))
        (export "take" (func $take))
        (export "take-async" (func $take-async))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable.join" (func $join))
        (export "subtask.drop" (func $subtask-drop))
        (export "task.return" (func $task-return))
        (export "return-bool" (func $return-bool))
        (export "return-bools" (func $return-bools))
      ))
    )
  )

  (func (export "run") async
    (canon lift (core func $i "run") async (callback (core func $i "callback"))))
  (func (export "run-async") async
    (canon lift (core func $i "run-async") async (callback (core func $i "callback"))))
  (func (export "bool-of") async (param "bits" u32) (result bool)
    (canon lift (core func $i "bool-of") async (callback (core func $i "callback"))))
  (func (export "bools") async (result (list bool))
    (canon lift (core func $i "bools") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
