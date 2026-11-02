/**
 * 测试入口：单进程执行。
 * 沙箱里 `node --test` 和 test runner 的 run() 都会 spawn 子进程（EPERM），
 * 所以这里直接 import 测试文件，让 node:test 在当前进程里注册并执行。
 *   node tools/verify.mjs
 */
import 'node:test';
import './verify-cases.mjs';
