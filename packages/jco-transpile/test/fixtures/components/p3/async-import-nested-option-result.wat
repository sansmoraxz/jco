;; Async-lowered host imports return an `option<option<u32>>` and an
;; `option<option<option<u32>>>`, which are lowered into guest memory. Each export
;; hands the value it read back to `task.return`, so the host gets back what the
;; guest saw.
(component
  (import "get2" (func $get2 async (result (option (option u32)))))
  (import "get3" (func $get3 async (result (option (option (option u32))))))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $get2 (canon lower (func $get2) async (memory (core memory $libc "mem"))))
  (core func $get3 (canon lower (func $get3) async (memory (core memory $libc "mem"))))
  (core func $wset-new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core func $subtask-drop (canon subtask.drop))
  (core func $return2 (canon task.return (result (option (option u32)))))
  (core func $return3 (canon task.return (result (option (option (option u32))))))

  (core module $m
    (import "" "mem" (memory 1))
    (import "" "get2" (func $get2 (param i32) (result i32)))
    (import "" "get3" (func $get3 (param i32) (result i32)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))
    (import "" "subtask.drop" (func $subtask-drop (param i32)))
    (import "" "return2" (func $return2 (param i32 i32 i32)))
    (import "" "return3" (func $return3 (param i32 i32 i32 i32)))

    (global $set (mut i32) (i32.const 0))
    (global $depth (mut i32) (i32.const 0))

    ;; Hands the value at offset 16 to `task.return`.
    (func $return
      (if (i32.eq (global.get $depth) (i32.const 2))
        (then
          (call $return2
            (i32.load8_u (i32.const 16))
            (i32.load8_u (i32.const 20))
            (i32.load (i32.const 24))))
        (else
          (call $return3
            (i32.load8_u (i32.const 16))
            (i32.load8_u (i32.const 20))
            (i32.load8_u (i32.const 24))
            (i32.load (i32.const 28))))))

    ;; Returns now if the call returned, or waits for it.
    (func $settle (param $status i32) (result i32)
      (if (i32.eq (i32.and (local.get $status) (i32.const 0xf)) (i32.const 2 (; RETURNED ;)))
        (then
          (call $return)
          (return (i32.const 0 (; EXIT ;)))))
      (global.set $set (call $wset-new))
      (call $join (i32.shr_u (local.get $status) (i32.const 4)) (global.get $set))
      (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (global.get $set) (i32.const 4))))

    (func (export "run2") (result i32)
      (global.set $depth (i32.const 2))
      (call $settle (call $get2 (i32.const 16))))

    (func (export "run3") (result i32)
      (global.set $depth (i32.const 3))
      (call $settle (call $get3 (i32.const 16))))

    (func (export "callback") (param $event i32) (param $subtask i32) (param $status i32) (result i32)
      (if (i32.ne (local.get $event) (i32.const 1 (; SUBTASK ;)))
        (then unreachable))
      (if (i32.ne (local.get $status) (i32.const 2 (; RETURNED ;)))
        (then (return (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (global.get $set) (i32.const 4))))))
      (call $subtask-drop (local.get $subtask))
      (call $return)
      (i32.const 0 (; EXIT ;)))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "mem" (memory $libc "mem"))
        (export "get2" (func $get2))
        (export "get3" (func $get3))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable.join" (func $join))
        (export "subtask.drop" (func $subtask-drop))
        (export "return2" (func $return2))
        (export "return3" (func $return3))
      ))
    )
  )

  (func (export "run2") async (result (option (option u32)))
    (canon lift (core func $i "run2") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "run3") async (result (option (option (option u32))))
    (canon lift (core func $i "run3") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
