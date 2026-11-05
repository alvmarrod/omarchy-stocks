import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui

// Compact bar entry: the selected ticker's last price and day change. The
// panel owns all state and fetching, so the bar only reads the values it
// exposes. Follows the same open/close/opened contract as omarchy.weather so
// shell summon/hide/toggle route here.
BarWidget {
  id: root
  moduleName: "io.github.alvmarrod.stocks"

  readonly property var panel: panelLoader.item
  readonly property string symbolText: panel ? panel.barSymbol : "Stocks"
  readonly property string priceText: panel ? panel.barPrice : ""
  readonly property string changeText: panel ? panel.barChange : ""
  readonly property bool quoteDown: panel ? panel.barDown : false
  readonly property bool quoteUp: panel ? panel.barUp : false
  readonly property color upColor: panel ? panel.upColor : "#5fbf6f"
  readonly property color downColor: panel ? panel.downColor : (bar ? bar.urgent : Color.urgent)

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function refresh() {
    if (panel && panel.refresh) panel.refresh()
  }

  function open() {
    if (panel && panel.open) panel.open()
  }

  function close() {
    if (panel && panel.close) panel.close()
  }

  function togglePanel() {
    if (panel && panel.toggle) panel.toggle()
  }

  // Shape contract for shell.summon/hide/toggle routing.
  readonly property bool opened: panel ? panel.opened === true : false
  readonly property bool popoutSwitchClosing: panel ? panel.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panel) panel.closeForPopoutSwitch()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: "io.github.alvmarrod.stocks"

    function refresh(): void { root.broadcast("refresh") }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.symbolText + " " + root.priceText + " " + root.changeText
    labelVisible: false
    hasVisualContent: true
    fixedWidth: contentRow.implicitWidth + Style.space(16)
    // The panel is the detail view, so no tooltip (as with omarchy.weather).
    tooltipText: ""

    onPressed: function(button) {
      if (button === Qt.MiddleButton) root.refresh()
      else root.togglePanel()
    }

    Row {
      id: contentRow
      anchors.centerIn: parent
      spacing: Style.space(5)

      Text {
        textFormat: Text.PlainText
        text: root.symbolText
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        font.bold: true
        renderType: Text.NativeRendering
      }

      Text {
        textFormat: Text.PlainText
        visible: !root.vertical && root.priceText !== ""
        text: root.priceText
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        renderType: Text.NativeRendering
      }

      Text {
        textFormat: Text.PlainText
        visible: !root.vertical && root.changeText !== ""
        text: root.changeText
        color: root.quoteDown ? root.downColor : (root.quoteUp ? root.upColor : button.foreground)
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        renderType: Text.NativeRendering
      }
    }
  }
}
