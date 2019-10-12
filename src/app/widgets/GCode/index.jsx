import classNames from 'classnames';
import mapValues from 'lodash/mapValues';
import pubsub from 'pubsub-js';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import FontAwesomeIcon from 'app/components/FontAwesomeIcon';
import Space from 'app/components/Space';
import Widget from 'app/components/Widget';
import controller from 'app/lib/controller';
import i18n from 'app/lib/i18n';
import { mapPositionToUnits } from 'app/lib/units';
import { WidgetConfigContext } from 'app/widgets/context';
import WidgetConfig from 'app/widgets/WidgetConfig';
import {
    IMPERIAL_UNITS,
    METRIC_UNITS
} from 'app/constants';
import {
    GRBL,
    MARLIN,
    SMOOTHIE,
    TINYG,
} from 'app/constants/controller';
import GCode from './GCode';
import styles from './index.styl';

class GCodeWidget extends PureComponent {
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

    controllerEvents = {
        'serialport:open': (options) => {
            const { port } = options;
            this.setState({ port: port });
        },
        'serialport:close': (options) => {
            const initialState = this.getInitialState();
            this.setState({ ...initialState });
        },
        'gcode:unload': () => {
            this.setState({
                bbox: {
                    min: {
                        x: 0,
                        y: 0,
                        z: 0
                    },
                    max: {
                        x: 0,
                        y: 0,
                        z: 0
                    },
                    delta: {
                        x: 0,
                        y: 0,
                        z: 0
                    }
                }
            });
        },
        'sender:status': (data) => {
            const { total, sent, received, startTime, finishTime, elapsedTime, remainingTime } = data;

            this.setState({
                total,
                sent,
                received,
                startTime,
                finishTime,
                elapsedTime,
                remainingTime
            });
        },
        'controller:state': (type, state) => {
            // Grbl
            if (type === GRBL) {
                const { parserstate } = { ...state };
                const { modal = {} } = { ...parserstate };
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                if (this.state.units !== units) {
                    this.setState({ units: units });
                }
            }

            // Marlin
            if (type === MARLIN) {
                const { modal = {} } = { ...state };
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                if (this.state.units !== units) {
                    this.setState({ units: units });
                }
            }

            // Smoothie
            if (type === SMOOTHIE) {
                const { parserstate } = { ...state };
                const { modal = {} } = { ...parserstate };
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                if (this.state.units !== units) {
                    this.setState({ units: units });
                }
            }

            // TinyG
            if (type === TINYG) {
                const { sr } = { ...state };
                const { modal = {} } = { ...sr };
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                if (this.state.units !== units) {
                    this.setState({ units: units });
                }
            }
        }
    };

    pubsubTokens = [];

    componentDidMount() {
        this.subscribe();
        this.addControllerEvents();
    }

    componentWillUnmount() {
        this.removeControllerEvents();
        this.unsubscribe();
    }

    componentDidUpdate(prevProps, prevState) {
        const {
            minimized
        } = this.state;

        this.config.set('minimized', minimized);
    }

    getInitialState() {
        return {
            minimized: this.config.get('minimized', false),
            isFullscreen: false,

            port: controller.port,
            units: METRIC_UNITS,

            // G-code Status (from server)
            total: 0,
            sent: 0,
            received: 0,
            startTime: 0,
            finishTime: 0,
            elapsedTime: 0,
            remainingTime: 0,

            // Bounding box
            bbox: {
                min: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                max: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                delta: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            }
        };
    }

    subscribe() {
        const tokens = [
            pubsub.subscribe('gcode:bbox', (msg, bbox) => {
                const dX = bbox.max.x - bbox.min.x;
                const dY = bbox.max.y - bbox.min.y;
                const dZ = bbox.max.z - bbox.min.z;

                this.setState({
                    bbox: {
                        min: {
                            x: bbox.min.x,
                            y: bbox.min.y,
                            z: bbox.min.z
                        },
                        max: {
                            x: bbox.max.x,
                            y: bbox.max.y,
                            z: bbox.max.z
                        },
                        delta: {
                            x: dX,
                            y: dY,
                            z: dZ
                        }
                    }
                });
            })
        ];
        this.pubsubTokens = this.pubsubTokens.concat(tokens);
    }

    unsubscribe() {
        this.pubsubTokens.forEach((token) => {
            pubsub.unsubscribe(token);
        });
        this.pubsubTokens = [];
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

    render() {
        const { widgetId } = this.props;
        const { minimized, isFullscreen } = this.state;
        const { units, bbox } = this.state;
        const isForkedWidget = widgetId.match(/\w+:[\w\-]+/);
        const state = {
            ...this.state,
            bbox: mapValues(bbox, (position) => {
                return mapValues(position, (pos, axis) => {
                    return mapPositionToUnits(pos, units);
                });
            })
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
                            {i18n._('G-code')}
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
                        <GCode
                            state={state}
                            actions={actions}
                        />
                    </Widget.Content>
                </Widget>
            </WidgetConfigContext.Provider>
        );
    }
}

export default GCodeWidget;
