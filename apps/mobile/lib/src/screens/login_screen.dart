import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api.dart';
import '../app_settings.dart';
import '../config.dart';
import '../i18n.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

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

  /// A translation key, or an [ApiException] from the server.
  Object? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final email = _email.text.trim();
    setState(() => _error = null);
    if (email.isEmpty || !email.contains('@')) return setState(() => _error = 'login.err_email');
    if (_password.text.isEmpty) return setState(() => _error = 'login.err_password');
    setState(() => _busy = true);
    try {
      await SessionScope.of(context).login(email, _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.status == 401 ? 'login.err_credentials' : e);
    } catch (_) {
      if (mounted) setState(() => _error = 'login.err_generic');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    return Scaffold(
      backgroundColor: Hgv.of(context).surface,
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
                    const Spacer(),
                    const _LanguageButton(),
                  ]),
                  const SizedBox(height: 36),
                  Text(t('login.title'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  Text(t('login.subtitle'),
                      style: TextStyle(fontSize: 15, color: Hgv.of(context).muted, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 28),
                  if (_error != null) ...[
                    _Banner(_error is String ? t(_error as String) : errorText(t, _error!), Hgv.of(context).danger),
                    const SizedBox(height: 14),
                  ],
                  _Label(t('login.email')),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                    decoration: InputDecoration(hintText: t('login.email_ph'), prefixIcon: const Icon(Icons.mail_outline)),
                  ),
                  const SizedBox(height: 16),
                  _Label(t('login.password')),
                  TextField(
                    controller: _password,
                    obscureText: _hidePassword,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _signIn(),
                    decoration: InputDecoration(
                      hintText: t('login.password_ph'),
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: _hidePassword ? t('login.show_pw') : t('login.hide_pw'),
                        onPressed: () => setState(() => _hidePassword = !_hidePassword),
                        icon: Icon(_hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      ),
                    ),
                  ),
                  // Below the field: long translations then never squeeze the label.
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: TextButton(
                      onPressed: _busy
                          ? null
                          : () => Navigator.push(context,
                              MaterialPageRoute(builder: (_) => ForgotPasswordScreen(initialEmail: _email.text.trim()))),
                      child: Text(t('login.forgot'), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: _busy ? null : _signIn,
                    child: _busy
                        ? const RingsLoader(size: 24, color: Colors.white)
                        : Text(t('login.sign_in')),
                  ),
                  const SizedBox(height: 24),
                  const Divider(),
                  const SizedBox(height: 16),
                  Text(t('login.no_account'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(t('login.admin_note'),
                      style: TextStyle(color: Hgv.of(context).muted, height: 1.4)),
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

  /// A translation key, or an [ApiException] from the server.
  Object? _error;

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
      throw ApiException(0, 'No connection to Higoverse. Check your internet and try again.', key: 'err.network');
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
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _sendCode() {
    final email = _email.text.trim();
    if (!email.contains('@')) return setState(() => _error = 'login.err_email');
    _run(() async {
      await _post('forgot-password', {'email': email});
      if (mounted) setState(() => _codeSent = true);
    });
  }

  void _reset() {
    if (_code.text.trim().length != 6) return setState(() => _error = 'reset.err_code');
    if (_newPassword.text.length < 6) return setState(() => _error = 'reset.err_short');
    _run(() async {
      await _post('reset-password', {'email': _email.text.trim(), 'otp': _code.text.trim(), 'new_password': _newPassword.text});
      if (mounted) setState(() => _done = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    return Scaffold(
      backgroundColor: Hgv.of(context).surface,
      appBar: AppBar(title: Text(t('reset.title'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (_done) ...[
              _Banner(t('reset.done'), Hgv.of(context).success),
              const SizedBox(height: 18),
              FilledButton(onPressed: () => Navigator.pop(context), child: Text(t('reset.back'))),
            ] else ...[
              Text(
                _codeSent ? t('reset.sent', {'email': _email.text.trim()}) : t('reset.intro'),
                style: TextStyle(color: Hgv.of(context).muted, height: 1.4),
              ),
              const SizedBox(height: 18),
              if (_error != null) ...[
                _Banner(_error is String ? t(_error as String) : errorText(t, _error!), Hgv.of(context).danger),
                const SizedBox(height: 14),
              ],
              if (!_codeSent) ...[
                _Label(t('login.email')),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: InputDecoration(hintText: t('login.email_ph'), prefixIcon: const Icon(Icons.mail_outline)),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _busy ? null : _sendCode, child: Text(_busy ? t('reset.sending') : t('reset.send'))),
              ] else ...[
                _Label(t('reset.code')),
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(hintText: '000000', counterText: ''),
                ),
                const SizedBox(height: 14),
                _Label(t('reset.new_pw')),
                TextField(
                  controller: _newPassword,
                  obscureText: true,
                  decoration: InputDecoration(hintText: t('reset.new_pw_ph'), prefixIcon: const Icon(Icons.lock_outline)),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _busy ? null : _reset, child: Text(_busy ? t('reset.saving') : t('reset.submit'))),
                TextButton(onPressed: _busy ? null : _sendCode, child: Text(t('reset.resend'))),
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

/// Language picker on the sign-in screen, before any account is known.
class _LanguageButton extends StatelessWidget {
  const _LanguageButton();

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final settings = AppSettingsScope.of(context);
    return PopupMenuButton<String>(
      tooltip: t('acc.language'),
      initialValue: t.lang,
      onSelected: settings.setLanguage,
      itemBuilder: (_) => [for (final (code, label) in languages) PopupMenuItem(value: code, child: Text(label))],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.translate, size: 18, color: Hgv.of(context).muted),
          const SizedBox(width: 6),
          Text(t.lang.toUpperCase(), style: TextStyle(fontWeight: FontWeight.w700, color: Hgv.of(context).muted)),
          Icon(Icons.arrow_drop_down, color: Hgv.of(context).muted),
        ]),
      ),
    );
  }
}
