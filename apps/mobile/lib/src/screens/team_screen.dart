import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import '../chat/chat_service.dart';
import '../i18n.dart';
import '../live/live.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'messages_screen.dart';

const employeeRoles = ['manager', 'cashier', 'storekeeper', 'accountant'];

/// The business's people. Its owner (or admin) adds up to three employees,
/// each with their own sign-in, switches them off or removes them.
class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  late final ChatService _chat = ChatService.of(SessionScope.of(context));
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _chat.start(LiveScope.read(context));
    _chat.loadTeam().catchError((_) {});
  }

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _add() async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _AddEmployeeSheet(chat: _chat),
    );
    if (ok == true && mounted) _say(T.of(context)('team.added'));
  }

  Future<void> _remove(Member m) async {
    final t = T.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('team.remove_q', {'name': m.name})),
        content: Text(t('team.remove_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t('app.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Hgv.of(context).danger),
            onPressed: () => Navigator.pop(c, true),
            child: Text(t('team.remove')),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await _chat.removeEmployee(m.id);
    } catch (e) {
      if (mounted) _say(errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t('team.title'))),
      body: ListenableBuilder(
        listenable: _chat,
        builder: (context, _) {
          final room = _chat.maxEmployees - _chat.employees;
          return ListView(padding: const EdgeInsets.fromLTRB(8, 8, 8, 24), children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
              child: Text(t('team.intro', {'n': _chat.maxEmployees}), style: TextStyle(color: c.muted, height: 1.35)),
            ),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (var i = 0; i < _chat.members.length; i++) ...[
                  if (i > 0) const Divider(indent: 72),
                  _MemberRow(
                    member: _chat.members[i],
                    isMe: _chat.members[i].id == _chat.me,
                    manage: _chat.canManage && employeeRoles.contains(_chat.members[i].role),
                    onActive: (v) => _chat.setEmployee(_chat.members[i].id, active: v).catchError((Object e) => _say(errorText(t, e))),
                    onRole: (r) => _chat.setEmployee(_chat.members[i].id, role: r).catchError((Object e) => _say(errorText(t, e))),
                    onRemove: () => _remove(_chat.members[i]),
                  ),
                ],
              ]),
            ),
            if (_chat.canManage) ...[
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: room > 0 ? _add : null,
                icon: const Icon(PhosphorIconsBold.userPlus, size: 18),
                label: Text(room > 0 ? t('team.add_n', {'n': _chat.employees, 'max': _chat.maxEmployees}) : t('team.full', {'max': _chat.maxEmployees})),
              ),
            ],
          ]);
        },
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member, required this.isMe, required this.manage, required this.onActive, required this.onRole, required this.onRemove});
  final Member member;
  final bool isMe, manage;
  final ValueChanged<bool> onActive;
  final ValueChanged<String> onRole;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return ListTile(
      contentPadding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
      leading: Avatar(name: member.name, size: 46),
      title: Text(isMe ? '${member.name} (${t('chat.you')})' : member.name, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text([roleLabel(t, member.role), if (!member.active) t('team.off')].join(' · '),
          style: TextStyle(color: member.active ? c.faint : c.warning)),
      trailing: !manage
          ? null
          : PopupMenuButton<String>(
              icon: const Icon(PhosphorIconsRegular.dotsThreeVertical),
              onSelected: (v) {
                if (v == 'toggle') {
                  onActive(!member.active);
                } else if (v == 'remove') {
                  onRemove();
                } else {
                  onRole(v);
                }
              },
              itemBuilder: (_) => [
                for (final r in employeeRoles)
                  if (r != member.role) PopupMenuItem(value: r, child: Text(t('team.make', {'role': roleLabel(t, r)}))),
                const PopupMenuDivider(),
                PopupMenuItem(value: 'toggle', child: Text(member.active ? t('team.switch_off') : t('team.switch_on'))),
                PopupMenuItem(value: 'remove', child: Text(t('team.remove'), style: TextStyle(color: c.danger))),
              ],
            ),
    );
  }
}

class _AddEmployeeSheet extends StatefulWidget {
  const _AddEmployeeSheet({required this.chat});
  final ChatService chat;

  @override
  State<_AddEmployeeSheet> createState() => _AddEmployeeSheetState();
}

class _AddEmployeeSheetState extends State<_AddEmployeeSheet> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _email = TextEditingController(), _password = TextEditingController();
  String _role = 'cashier';
  bool _saving = false, _hide = true;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await widget.chat.addEmployee(name: _name.text.trim(), email: _email.text.trim(), password: _password.text, role: _role);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(T.of(context), e))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = T.of(context);
    final c = Hgv.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: Form(
        key: _form,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(t('team.add'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(t('team.add_hint'), style: TextStyle(color: c.muted)),
          const SizedBox(height: 14),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: t('team.name')),
            validator: (v) => (v ?? '').trim().isEmpty ? t('form.need_name') : null,
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: t('team.email')),
            validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim()) ? null : t('team.need_email'),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _password,
            obscureText: _hide,
            decoration: InputDecoration(
              labelText: t('team.password'),
              helperText: t('team.password_hint'),
              suffixIcon: IconButton(
                onPressed: () => setState(() => _hide = !_hide),
                icon: Icon(_hide ? PhosphorIconsRegular.eye : PhosphorIconsRegular.eyeSlash),
              ),
            ),
            validator: (v) => (v ?? '').length < 8 ? t('team.need_password') : null,
          ),
          const SizedBox(height: 14),
          Text(t('team.role'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.muted)),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final r in employeeRoles)
              ChoiceChip(label: Text(roleLabel(t, r)), selected: _role == r, showCheckmark: false, onSelected: (_) => setState(() => _role = r)),
          ]),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                : Text(t('team.add')),
          ),
        ]),
      ),
    );
  }
}
