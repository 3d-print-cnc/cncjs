import get from 'lodash/get';
import includes from 'lodash/includes';
import map from 'lodash/map';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import FontAwesomeIcon from 'app/components/FontAwesomeIcon';
import Space from 'app/components/Space';
import Widget from 'app/components/Widget';
import {
    // Units
    IMPERIAL_UNITS,
    METRIC_UNITS,
} from 'app/constants';
import {
    // Grbl
    GRBL,
    GRBL_MACHINE_STATE_IDLE,
    // Marlin
    MARLIN,
    // Smoothie
    SMOOTHIE,
    SMOOTHIE_MACHINE_STATE_IDLE,
    // TinyG
    TINYG,
    TINYG_MACHINE_STATE_READY,
    TINYG_MACHINE_STATE_STOP,
    TINYG_MACHINE_STATE_END,
} from 'app/constants/controller';
import {
    WORKFLOW_STATE_IDLE,
} from 'app/constants/workflow';
import controller from 'app/lib/controller';
import i18n from 'app/lib/i18n';
import { in2mm, mapValueToUnits } from 'app/lib/units';
import { WidgetConfigContext } from 'app/widgets/context';
import WidgetConfig from 'app/widgets/WidgetConfig';
import Probe from './Probe';
import RunProbeModal from './modals/RunProbeModal';
import {
    MODAL_NONE,
    MODAL_PREVIEW
} from './constants';
import styles from './index.styl';

const gcode = (cmd, params) => {
    const s = map(params, (value, letter) => String(letter + value)).join(' ');
    return (s.length > 0) ? (cmd + ' ' + s) : cmd;
};

class ProbeWidget extends PureComponent {
    static propTypes = {
        widgetId: PropTypes.string.isRequired,
        onFork: PropTypes.func.isRequired,
        onRemove: PropTypes.func.isRequired,
        sortable: PropTypes.object
    };

    // Public methods
    collapse = () => {
        this.setState({ minimized: true });
    };

    expand = () => {
        this.setState({ minimized: false });
    };

    config = new WidgetConfig(this.props.widgetId);

    state = this.getInitialState();

    toggleFullscreen = () => {
        this.setState(state => ({
            minimized: state.isFullscreen ? state.minimized : false,
            isFullscreen: !state.isFullscreen,
        }));
    };

    toggleMinimized = () => {
        this.setState(state => ({
            minimized: !state.minimized,
        }));
    };

    actions = {
        openModal: (name = MODAL_NONE, params = {}) => {
            this.setState({
                modal: {
                    name: name,
                    params: params
                }
            });
        },
        closeModal: () => {
            this.setState({
                modal: {
                    name: MODAL_NONE,
                    params: {}
                }
            });
        },
        updateModalParams: (params = {}) => {
            this.setState({
                modal: {
                    ...this.state.modal,
                    params: {
                        ...this.state.modal.params,
                        ...params
                    }
                }
            });
        },
        changeProbeAxis: (value) => {
            this.setState({ probeAxis: value });
        },
        changeProbeCommand: (value) => {
            this.setState({ probeCommand: value });
        },
        toggleUseTLO: () => {
            const { useTLO } = this.state;
            this.setState({ useTLO: !useTLO });
        },
        handleProbeDepthChange: (event) => {
            const probeDepth = event.target.value;
            this.setState({ probeDepth });
        },
        handleProbeFeedrateChange: (event) => {
            const probeFeedrate = event.target.value;
            this.setState({ probeFeedrate });
        },
        handleTouchPlateHeightChange: (event) => {
            const touchPlateHeight = event.target.value;
            this.setState({ touchPlateHeight });
        },
        handleRetractionDistanceChange: (event) => {
            const retractionDistance = event.target.value;
            this.setState({ retractionDistance });
        },
        populateProbeCommands: () => {
            const {
                probeAxis,
                probeCommand,
                useTLO,
                probeDepth,
                probeFeedrate,
                touchPlateHeight,
                retractionDistance
            } = this.state;
            const wcs = this.getWorkCoordinateSystem();
            const mapWCSToP = (wcs) => ({
                'G54': 1,
                'G55': 2,
                'G56': 3,
                'G57': 4,
                'G58': 5,
                'G59': 6
            }[wcs] || 0);
            const towardWorkpiece = includes(['G38.2', 'G38.3'], probeCommand);
            const posname = `pos${probeAxis.toLowerCase()}`;
            const tloProbeCommands = [
                gcode('; Cancel tool length offset'),
                // Cancel tool length offset
                gcode('G49'),

                // Probe (use relative distance mode)
                gcode(`; ${probeAxis}-Probe`),
                gcode('G91'),
                gcode(probeCommand, {
                    [probeAxis]: towardWorkpiece ? -probeDepth : probeDepth,
                    F: probeFeedrate
                }),
                // Use absolute distance mode
                gcode('G90'),

                // Dwell
                gcode('; A dwell time of one second'),
                gcode('G4 P1'),

                // Apply touch plate height with tool length offset
                gcode('; Set tool length offset'),
                gcode('G43.1', {
                    [probeAxis]: towardWorkpiece ? `[${posname}-${touchPlateHeight}]` : `[${posname}+${touchPlateHeight}]`
                }),

                // Retract from the touch plate (use relative distance mode)
                gcode('; Retract from the touch plate'),
                gcode('G91'),
                gcode('G0', {
                    [probeAxis]: retractionDistance
                }),
                // Use asolute distance mode
                gcode('G90')
            ];
            const wcsProbeCommands = [
                // Probe (use relative distance mode)
                gcode(`; ${probeAxis}-Probe`),
                gcode('G91'),
                gcode(probeCommand, {
                    [probeAxis]: towardWorkpiece ? -probeDepth : probeDepth,
                    F: probeFeedrate
                }),
                // Use absolute distance mode
                gcode('G90'),

                // Set the WCS 0 offset
                gcode(`; Set the active WCS ${probeAxis}0`),
                gcode('G10', {
                    L: 20,
                    P: mapWCSToP(wcs),
                    [probeAxis]: touchPlateHeight
                }),

                // Retract from the touch plate (use relative distance mode)
                gcode('; Retract from the touch plate'),
                gcode('G91'),
                gcode('G0', {
                    [probeAxis]: retractionDistance
                }),
                // Use absolute distance mode
                gcode('G90')
            ];

            return useTLO ? tloProbeCommands : wcsProbeCommands;
        },
        runProbeCommands: (commands) => {
            controller.command('gcode', commands);
        }
    };

    controllerEvents = {
        'serialport:open': (options) => {
            const { port } = options;
            this.setState({ port: port });
        },
        'serialport:close': (options) => {
            const initialState = this.getInitialState();
            this.setState({ ...initialState });
        },
        'workflow:state': (workflowState) => {
            this.setState(state => ({
                workflow: {
                    state: workflowState
                }
            }));
        },
        'controller:state': (type, state) => {
            let units = this.state.units;

            // Grbl
            if (type === GRBL) {
                const { parserstate } = { ...state };
                const { modal = {} } = { ...parserstate };
                units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || units;
            }

            // Marlin
            if (type === MARLIN) {
                const { modal = {} } = { ...state };
                units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || units;
            }

            // Smoothie
            if (type === SMOOTHIE) {
                const { parserstate } = { ...state };
                const { modal = {} } = { ...parserstate };
                units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || units;
            }

            // TinyG
            if (type === TINYG) {
                const { sr } = { ...state };
                const { modal = {} } = { ...sr };
                units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || units;
            }

            if (this.state.units !== units) {
                // Set `this.unitsDidChange` to true if the unit has changed
                this.unitsDidChange = true;
            }

            this.setState({
                units: units,
                controller: {
                    type: type,
                    state: state
                },
                probeDepth: mapValueToUnits(this.config.get('probeDepth'), units),
                probeFeedrate: mapValueToUnits(this.config.get('probeFeedrate'), units),
                touchPlateHeight: mapValueToUnits(this.config.get('touchPlateHeight'), units),
                retractionDistance: mapValueToUnits(this.config.get('retractionDistance'), units)
            });
        }
    };

    unitsDidChange = false;

    componentDidMount() {
        this.addControllerEvents();
    }

    componentWillUnmount() {
        this.removeControllerEvents();
    }

    componentDidUpdate(prevProps, prevState) {
        const {
            minimized
        } = this.state;

        this.config.set('minimized', minimized);

        // Do not save config settings if the units did change between in and mm
        if (this.unitsDidChange) {
            this.unitsDidChange = false;
            return;
        }

        const { units, probeCommand, useTLO } = this.state;
        this.config.set('probeCommand', probeCommand);
        this.config.set('useTLO', useTLO);

        let {
            probeDepth,
            probeFeedrate,
            touchPlateHeight,
            retractionDistance
        } = this.state;

        // To save in mm
        if (units === IMPERIAL_UNITS) {
            probeDepth = in2mm(probeDepth);
            probeFeedrate = in2mm(probeFeedrate);
            touchPlateHeight = in2mm(touchPlateHeight);
            retractionDistance = in2mm(retractionDistance);
        }
        this.config.set('probeDepth', Number(probeDepth));
        this.config.set('probeFeedrate', Number(probeFeedrate));
        this.config.set('touchPlateHeight', Number(touchPlateHeight));
        this.config.set('retractionDistance', Number(retractionDistance));
    }

    getInitialState() {
        return {
            minimized: this.config.get('minimized', false),
            isFullscreen: false,
            canClick: true, // Defaults to true
            port: controller.port,
            units: METRIC_UNITS,
            controller: {
                type: controller.type,
                state: controller.state
            },
            workflow: {
                state: controller.workflow.state
            },
            modal: {
                name: MODAL_NONE,
                params: {}
            },
            probeAxis: this.config.get('probeAxis', 'Z'),
            probeCommand: this.config.get('probeCommand', 'G38.2'),
            useTLO: this.config.get('useTLO'),
            probeDepth: Number(this.config.get('probeDepth') || 0).toFixed(3) * 1,
            probeFeedrate: Number(this.config.get('probeFeedrate') || 0).toFixed(3) * 1,
            touchPlateHeight: Number(this.config.get('touchPlateHeight') || 0).toFixed(3) * 1,
            retractionDistance: Number(this.config.get('retractionDistance') || 0).toFixed(3) * 1
        };
    }

    addControllerEvents() {
        Object.keys(this.controllerEvents).forEach(eventName => {
            const callback = this.controllerEvents[eventName];
            controller.addListener(eventName, callback);
        });
    }

    removeControllerEvents() {
        Object.keys(this.controllerEvents).forEach(eventName => {
            const callback = this.controllerEvents[eventName];
            controller.removeListener(eventName, callback);
        });
    }

    getWorkCoordinateSystem() {
        const controllerType = this.state.controller.type;
        const controllerState = this.state.controller.state;
        const defaultWCS = 'G54';

        if (controllerType === GRBL) {
            return get(controllerState, 'parserstate.modal.wcs') || defaultWCS;
        }

        if (controllerType === MARLIN) {
            return get(controllerState, 'modal.wcs') || defaultWCS;
        }

        if (controllerType === SMOOTHIE) {
            return get(controllerState, 'parserstate.modal.wcs') || defaultWCS;
        }

        if (controllerType === TINYG) {
            return get(controllerState, 'sr.modal.wcs') || defaultWCS;
        }

        return defaultWCS;
    }

    canClick() {
        const { port, workflow } = this.state;
        const controllerType = this.state.controller.type;
        const controllerState = this.state.controller.state;

        if (!port) {
            return false;
        }
        if (workflow.state !== WORKFLOW_STATE_IDLE) {
            return false;
        }
        if (!includes([GRBL, MARLIN, SMOOTHIE, TINYG], controllerType)) {
            return false;
        }
        if (controllerType === GRBL) {
            const machineState = get(controllerState, 'status.machineState');
            const states = [
                GRBL_MACHINE_STATE_IDLE
            ];
            if (!includes(states, machineState)) {
                return false;
            }
        }
        if (controllerType === MARLIN) {
            // Marlin does not have machine state
        }
        if (controllerType === SMOOTHIE) {
            const machineState = get(controllerState, 'status.machineState');
            const states = [
                SMOOTHIE_MACHINE_STATE_IDLE
            ];
            if (!includes(states, machineState)) {
                return false;
            }
        }
        if (controllerType === TINYG) {
            const machineState = get(controllerState, 'sr.machineState');
            const states = [
                TINYG_MACHINE_STATE_READY,
                TINYG_MACHINE_STATE_STOP,
                TINYG_MACHINE_STATE_END
            ];
            if (!includes(states, machineState)) {
                return false;
            }
        }

        return true;
    }

    render() {
        const { widgetId } = this.props;
        const { minimized, isFullscreen } = this.state;
        const isForkedWidget = widgetId.match(/\w+:[\w\-]+/);
        const state = {
            ...this.state,
            canClick: this.canClick(),
        };
        const actions = {
            ...this.actions
        };

        return (
            <WidgetConfigContext.Provider value={this.config}>
                <Widget fullscreen={isFullscreen}>
                    <Widget.Header>
                        <Widget.Title>
                            <Widget.Sortable className={this.props.sortable.handleClassName}>
                                <FontAwesomeIcon icon="bars" fixedWidth />
                                <Space width={4} />
                            </Widget.Sortable>
                            {isForkedWidget &&
                            <FontAwesomeIcon icon="code-branch" fixedWidth />
                            }
                            {i18n._('Probe')}
                        </Widget.Title>
                        <Widget.Controls className={this.props.sortable.filterClassName}>
                            <Widget.Button
                                disabled={isFullscreen}
                                title={minimized ? i18n._('Expand') : i18n._('Collapse')}
                                onClick={this.toggleMinimized}
                            >
                                {minimized &&
                                <FontAwesomeIcon icon="chevron-down" fixedWidth />
                                }
                                {!minimized &&
                                <FontAwesomeIcon icon="chevron-up" fixedWidth />
                                }
                            </Widget.Button>
                            {isFullscreen && (
                                <Widget.Button
                                    title={i18n._('Exit Full Screen')}
                                    onClick={this.toggleFullscreen}
                                >
                                    <FontAwesomeIcon icon="compress" fixedWidth />
                                </Widget.Button>
                            )}
                            <Widget.DropdownButton
                                title={i18n._('More')}
                                toggle={(
                                    <FontAwesomeIcon icon="ellipsis-v" fixedWidth />
                                )}
                                onSelect={(eventKey) => {
                                    if (eventKey === 'fullscreen') {
                                        this.toggleFullscreen();
                                    } else if (eventKey === 'fork') {
                                        this.props.onFork();
                                    } else if (eventKey === 'remove') {
                                        this.props.onRemove();
                                    }
                                }}
                            >
                                <Widget.DropdownMenuItem eventKey="fullscreen">
                                    {!isFullscreen && (
                                        <FontAwesomeIcon icon="expand" fixedWidth />
                                    )}
                                    {isFullscreen && (
                                        <FontAwesomeIcon icon="compress" fixedWidth />
                                    )}
                                    <Space width={8} />
                                    {!isFullscreen ? i18n._('Enter Full Screen') : i18n._('Exit Full Screen')}
                                </Widget.DropdownMenuItem>
                                <Widget.DropdownMenuItem eventKey="fork">
                                    <FontAwesomeIcon icon="code-branch" fixedWidth />
                                    <Space width={8} />
                                    {i18n._('Fork Widget')}
                                </Widget.DropdownMenuItem>
                                <Widget.DropdownMenuItem eventKey="remove">
                                    <FontAwesomeIcon icon="times" fixedWidth />
                                    <Space width={8} />
                                    {i18n._('Remove Widget')}
                                </Widget.DropdownMenuItem>
                            </Widget.DropdownButton>
                        </Widget.Controls>
                    </Widget.Header>
                    <Widget.Content
                        className={classNames(
                            styles['widget-content'],
                            { [styles.hidden]: minimized }
                        )}
                    >
                        {state.modal.name === MODAL_PREVIEW &&
                        <RunProbeModal state={state} actions={actions} />
                        }
                        <Probe
                            state={state}
                            actions={actions}
                        />
                    </Widget.Content>
                </Widget>
            </WidgetConfigContext.Provider>
        );
    }
}

export default ProbeWidget;
