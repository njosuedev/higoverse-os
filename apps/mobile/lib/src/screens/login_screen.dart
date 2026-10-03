import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api.dart';
import '../config.dart';
import '../session.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hidePassword = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final email = _email.text.trim();
    setState(() => _error = null);
    if (email.isEmpty || !email.contains('@')) return setState(() => _error = 'Enter the email address of your account.');
    if (_password.text.isEmpty) return setState(() => _error = 'Enter your password.');
    setState(() => _busy = true);
    try {
      await SessionScope.of(context).login(email, _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.status == 401 ? 'Incorrect email or password.' : e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not sign in. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.asset('assets/higoverse-logo.png', width: 36, height: 36),
                    ),
                    const SizedBox(width: 10),
                    const Text('Higoverse', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ]),
                  const SizedBox(height: 36),
                  const Text('Log into Higoverse', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  const Text('Sign in to your Higoverse shop account',
                      style: TextStyle(fontSize: 15, color: Brand.muted, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 28),
                  if (_error != null) ...[
                    _Banner(_error!, Brand.danger),
                    const SizedBox(height: 14),
                  ],
                  const _Label('Email'),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                    decoration: const InputDecoration(hintText: 'Email address', prefixIcon: Icon(Icons.mail_outline)),
                  ),
                  const SizedBox(height: 16),
                  Row(children: [
                    const Expanded(child: _Label('Password')),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => Navigator.push(context,
                              MaterialPageRoute(builder: (_) => ForgotPasswordScreen(initialEmail: _email.text.trim()))),
                      child: const Text('Forgot password?', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ]),
                  TextField(
                    controller: _password,
                    obscureText: _hidePassword,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _signIn(),
                    decoration: InputDecoration(
                      hintText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: _hidePassword ? 'Show password' : 'Hide password',
                        onPressed: () => setState(() => _hidePassword = !_hidePassword),
                        icon: Icon(_hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  FilledButton(
                    onPressed: _busy ? null : _signIn,
                    child: _busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                        : const Text('Sign in'),
                  ),
                  const SizedBox(height: 24),
                  const Divider(),
                  const SizedBox(height: 16),
                  const Text("Don't have an account?", style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  const Text('Shop accounts are created by your Higoverse administrator.',
                      style: TextStyle(color: Brand.muted, height: 1.4)),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Reset by email: send a 6-digit code, then set a new password with it.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});
  final String initialEmail;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: widget.initialEmail);
  final _code = TextEditingController();
  final _newPassword = TextEditingController();
  bool _codeSent = false, _done = false, _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _newPassword.dispose();
    super.dispose();
  }

  Future<void> _post(String path, Map<String, String> body) async {
    final http.Response res;
    try {
      res = await http
          .post(Uri.parse('$apiBase${Svc.auth}/api/v1/auth/$path'),
              headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 20));
    } catch (_) {
      throw ApiException(0, 'No connection to Higoverse. Check your internet and try again.');
    }
    Api.decode(res);
  }

  Future<void> _run(Future<void> Function() step) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await step();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _sendCode() {
    final email = _email.text.trim();
    if (!email.contains('@')) return setState(() => _error = 'Enter the email address of your account.');
    _run(() async {
      await _post('forgot-password', {'email': email});
      if (mounted) setState(() => _codeSent = true);
    });
  }

  void _reset() {
    if (_code.text.trim().length != 6) return setState(() => _error = 'Enter the 6-digit code from your email.');
    if (_newPassword.text.length < 6) return setState(() => _error = 'The new password needs at least 6 characters.');
    _run(() async {
      await _post('reset-password', {'email': _email.text.trim(), 'otp': _code.text.trim(), 'new_password': _newPassword.text});
      if (mounted) setState(() => _done = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (_done) ...[
              const _Banner('Password updated. You can now sign in with your new password.', Brand.success),
              const SizedBox(height: 18),
              FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Back to sign in')),
            ] else ...[
              Text(
                _codeSent
                    ? 'We sent a 6-digit code to ${_email.text.trim()}. Enter it with your new password. If it has not arrived, check your spam folder.'
                    : "Enter your account's email and we'll send you a 6-digit code.",
                style: const TextStyle(color: Brand.muted, height: 1.4),
              ),
              const SizedBox(height: 18),
              if (_error != null) ...[_Banner(_error!, Brand.danger), const SizedBox(height: 14)],
              if (!_codeSent) ...[
                const _Label('Email'),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(hintText: 'Email address', prefixIcon: Icon(Icons.mail_outline)),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _busy ? null : _sendCode, child: Text(_busy ? 'Sending…' : 'Send code')),
              ] else ...[
                const _Label('6-digit code'),
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(hintText: '000000', counterText: ''),
                ),
                const SizedBox(height: 14),
                const _Label('New password'),
                TextField(
                  controller: _newPassword,
                  obscureText: true,
                  decoration: const InputDecoration(hintText: 'At least 6 characters', prefixIcon: Icon(Icons.lock_outline)),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _busy ? null : _reset, child: Text(_busy ? 'Saving…' : 'Reset password')),
                TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Send a new code')),
              ],
            ],
          ]),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
      );
}

class _Banner extends StatelessWidget {
  const _Banner(this.text, this.color);
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          border: Border.all(color: color.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      );
}
