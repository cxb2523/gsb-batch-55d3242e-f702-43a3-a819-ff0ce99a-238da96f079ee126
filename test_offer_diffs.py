"""Offline tests for the new/removed offer diffing in epic.PY and steam.py.

These tests never touch the real stores or send real messages: fetch functions
and notification channels are injected fakes, and state files live in temp dirs.

Run with:  python -m unittest test_offer_diffs -v
"""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_module(name, filename):
    path = ROOT / filename
    # epic.PY has an uppercase extension, so an explicit source loader is needed.
    loader = SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_file_location(name, path, loader=loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


epic = load_module("epic", "epic.PY")
steam = load_module("steam", "steam.py")


def epic_game(title, link, **overrides):
    game = {
        "title": title,
        "image": "",
        "link": link,
        "start": "01 Jan 2026, 09:30 PM IST",
        "end": "08 Jan 2026, 09:30 PM IST",
    }
    game.update(overrides)
    return game


def steam_game(title, link, offer_type="Free to Keep", **overrides):
    game = {
        "type": offer_type,
        "title": title,
        "link": link,
        "image": "",
        "time": "Limited Time Offer",
    }
    game.update(overrides)
    return game


def write_epic_state(path, current_games, upcoming_games):
    path.write_text(
        json.dumps(
            {
                "signature": "saved",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "current_games": current_games,
                "upcoming_games": upcoming_games,
            }
        ),
        encoding="utf-8",
    )


def write_steam_state(path, games):
    path.write_text(
        json.dumps(
            {
                "signature": "saved",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "games": games,
            }
        ),
        encoding="utf-8",
    )


def read_state(path):
    return json.loads(path.read_text(encoding="utf-8"))


class RecordingNotifiers:
    """Fake notification channels recording every invocation."""

    def __init__(self, channels=("email", "telegram", "discord", "whatsapp")):
        self.calls = {channel: [] for channel in channels}

    def epic_notifiers(self):
        return {
            channel: (lambda c, u, ch=channel: self.calls[ch].append((c, u)))
            for channel in self.calls
        }

    def steam_notifiers(self):
        return {
            channel: (lambda g, ch=channel: self.calls[ch].append(g))
            for channel in self.calls
        }


class EpicRunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_file = Path(self.tmp.name) / "free.json"
        self.recorder = RecordingNotifiers()

    def run_epic(self, current, upcoming, notifiers=None):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            epic.run(
                fetch_fn=lambda: (current, upcoming),
                state_file=str(self.state_file),
                notifiers=notifiers if notifiers is not None else self.recorder.epic_notifiers(),
            )
        return output.getvalue()

    def test_only_additions_notifies_new_games_only(self):
        game_a = epic_game("Flotsam", "https://store.epicgames.com/en-US/p/flotsam-266287")
        game_b = epic_game("Idle Champions", "https://store.epicgames.com/en-US/p/idle-champions")
        upcoming_u = epic_game("Knightica", "https://store.epicgames.com/en-US/p/knightica-3be45c")
        write_epic_state(self.state_file, [game_a], [])

        self.run_epic([game_a, game_b], [upcoming_u])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(len(calls), 1, f"{channel} should be notified exactly once")
            new_current, new_upcoming = calls[0]
            self.assertEqual([g["title"] for g in new_current], ["Idle Champions"])
            self.assertEqual([g["title"] for g in new_upcoming], ["Knightica"])

        state = read_state(self.state_file)
        self.assertEqual(
            [g["title"] for g in state["current_games"]], ["Flotsam", "Idle Champions"]
        )
        self.assertEqual([g["title"] for g in state["upcoming_games"]], ["Knightica"])

    def test_only_removals_updates_state_silently(self):
        game_a = epic_game("Flotsam", "https://store.epicgames.com/en-US/p/flotsam-266287")
        game_b = epic_game("Idle Champions", "https://store.epicgames.com/en-US/p/idle-champions")
        write_epic_state(self.state_file, [game_a, game_b], [])

        output = self.run_epic([game_a], [])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(calls, [], f"{channel} must not be notified on removals")
        self.assertIn("without notifications", output)
        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["current_games"]], ["Flotsam"])
        self.assertEqual(state["upcoming_games"], [])

    def test_add_and_remove_same_round_notifies_only_additions(self):
        game_a = epic_game("Flotsam", "https://store.epicgames.com/en-US/p/flotsam-266287")
        game_b = epic_game("Idle Champions", "https://store.epicgames.com/en-US/p/idle-champions")
        write_epic_state(self.state_file, [game_a], [])

        self.run_epic([game_b], [])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(len(calls), 1, f"{channel} should be notified exactly once")
            new_current, new_upcoming = calls[0]
            self.assertEqual([g["title"] for g in new_current], ["Idle Champions"])
            self.assertEqual(new_upcoming, [])

        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["current_games"]], ["Idle Champions"])

    def test_no_changes_keeps_state_untouched(self):
        # Saved entry differs only by tracking params, case and whitespace.
        saved = epic_game(
            "  FLOTSAM ",
            "https://store.epicgames.com/en-US/p/flotsam-266287/?utm_source=newsletter#top",
        )
        fetched = epic_game("Flotsam", "https://store.epicgames.com/en-US/p/flotsam-266287")
        write_epic_state(self.state_file, [saved], [])
        before = self.state_file.read_bytes()

        output = self.run_epic([fetched], [])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(calls, [], f"{channel} must not be notified when nothing changed")
        self.assertIn("No changes", output)
        self.assertEqual(self.state_file.read_bytes(), before)

    def test_notification_failure_still_saves_state(self):
        game_a = epic_game("Flotsam", "https://store.epicgames.com/en-US/p/flotsam-266287")
        write_epic_state(self.state_file, [], [])

        def failing_email(current, upcoming):
            raise RuntimeError("SMTP down")

        notifiers = self.recorder.epic_notifiers()
        notifiers["email"] = failing_email

        output = self.run_epic([game_a], [], notifiers=notifiers)

        self.assertEqual(len(self.recorder.calls["telegram"]), 1)
        self.assertIn("email", output)
        self.assertIn("JSON state saved", output)
        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["current_games"]], ["Flotsam"])


class SteamRunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_file = Path(self.tmp.name) / "free-steam.json"
        self.recorder = RecordingNotifiers()

    def run_steam(self, games, notifiers=None):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            steam.run(
                fetch_fn=lambda: games,
                state_file=str(self.state_file),
                notifiers=notifiers if notifiers is not None else self.recorder.steam_notifiers(),
            )
        return output.getvalue()

    def test_only_additions_notifies_new_games_only(self):
        game_a = steam_game("Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/")
        game_b = steam_game("Beta Siege", "https://store.steampowered.com/app/222/Beta_Siege/")
        write_steam_state(self.state_file, [game_a])

        self.run_steam([game_a, game_b])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(len(calls), 1, f"{channel} should be notified exactly once")
            self.assertEqual([g["title"] for g in calls[0]], ["Beta Siege"])

        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["games"]], ["Alpha Quest", "Beta Siege"])

    def test_only_removals_updates_state_silently(self):
        game_a = steam_game("Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/")
        game_b = steam_game("Beta Siege", "https://store.steampowered.com/app/222/Beta_Siege/")
        write_steam_state(self.state_file, [game_a, game_b])

        output = self.run_steam([game_a])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(calls, [], f"{channel} must not be notified on removals")
        self.assertIn("without notifications", output)
        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["games"]], ["Alpha Quest"])

    def test_add_and_remove_same_round_notifies_only_additions(self):
        game_a = steam_game("Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/")
        game_b = steam_game(
            "Beta Siege", "https://store.steampowered.com/app/222/Beta_Siege/", "Free Weekend"
        )
        write_steam_state(self.state_file, [game_a])

        self.run_steam([game_b])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(len(calls), 1, f"{channel} should be notified exactly once")
            self.assertEqual([g["title"] for g in calls[0]], ["Beta Siege"])

        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["games"]], ["Beta Siege"])

    def test_no_changes_keeps_state_untouched(self):
        # Steam appends ?snr=... tracking params that change between runs.
        saved = steam_game(
            " alpha   quest ",
            "https://store.steampowered.com/app/111/Alpha_Quest/?snr=1_7_7_2300_150_1",
        )
        fetched = steam_game(
            "Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/?snr=2_9_9_2300_150_9"
        )
        write_steam_state(self.state_file, [saved])
        before = self.state_file.read_bytes()

        output = self.run_steam([fetched])

        for channel, calls in self.recorder.calls.items():
            self.assertEqual(calls, [], f"{channel} must not be notified when nothing changed")
        self.assertIn("No Steam changes", output)
        self.assertEqual(self.state_file.read_bytes(), before)

    def test_notification_failure_still_saves_state(self):
        game_a = steam_game("Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/")
        write_steam_state(self.state_file, [])

        def failing_discord(games):
            raise RuntimeError("Discord 500")

        notifiers = self.recorder.steam_notifiers()
        notifiers["discord"] = failing_discord

        output = self.run_steam([game_a], notifiers=notifiers)

        self.assertEqual(len(self.recorder.calls["email"]), 1)
        self.assertIn("discord", output)
        self.assertIn("JSON state saved", output)
        state = read_state(self.state_file)
        self.assertEqual([g["title"] for g in state["games"]], ["Alpha Quest"])


class NormalizationTests(unittest.TestCase):
    def test_epic_key_ignores_tracking_params_case_and_whitespace(self):
        base = epic_game("Flotsam", "https://store.epicgames.com/en-US/p/flotsam-266287")
        variant = epic_game(
            "  flotsam\n",
            "https://store.epicgames.com/en-US/p/flotsam-266287/?utm_source=x&foo=1#frag",
        )
        self.assertEqual(epic.game_key(base), epic.game_key(variant))

    def test_steam_key_ignores_snr_param_case_and_whitespace(self):
        base = steam_game("Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/")
        variant = steam_game(
            "ALPHA   QUEST",
            "https://store.steampowered.com/app/111/Alpha_Quest?snr=1_7_7_2300_150_1",
        )
        self.assertEqual(steam.game_key(base), steam.game_key(variant))

    def test_different_offers_still_differ(self):
        game_a = steam_game("Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/")
        game_b = steam_game("Beta Siege", "https://store.steampowered.com/app/222/Beta_Siege/")
        self.assertNotEqual(steam.game_key(game_a), steam.game_key(game_b))
        weekend = steam_game(
            "Alpha Quest", "https://store.steampowered.com/app/111/Alpha_Quest/", "Free Weekend"
        )
        self.assertNotEqual(steam.game_key(game_a), steam.game_key(weekend))


if __name__ == "__main__":
    unittest.main()
