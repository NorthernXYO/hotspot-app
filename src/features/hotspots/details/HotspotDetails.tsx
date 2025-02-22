import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import animalName from 'angry-purple-tiger'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import {
  LayoutChangeEvent,
  Linking,
  ActivityIndicator,
  Insets,
} from 'react-native'
import { Hotspot, Witness } from '@helium/http'
import Animated from 'react-native-reanimated'
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import SkeletonPlaceholder from 'react-native-skeleton-placeholder'
import Box from '../../../components/Box'
import Text from '../../../components/Text'
import StatusBadge from './StatusBadge'
import HotspotDetailChart from './HotspotDetailChart'
import { RootState } from '../../../store/rootReducer'
import { getRewardChartData } from './RewardsHelper'
import { useAppDispatch } from '../../../store/store'
import { fetchHotspotData } from '../../../store/hotspotDetails/hotspotDetailsSlice'
import { fetchChartData } from '../../../store/rewards/rewardsSlice'
import HexBadge from './HexBadge'
import HotspotChecklist from '../checklist/HotspotChecklist'
import animateTransition from '../../../utils/animateTransition'
import HeliumSelect from '../../../components/HeliumSelect'
import { HeliumSelectItemType } from '../../../components/HeliumSelectItem'
import HotspotStatusBanner from './HotspotStatusBanner'
import useToggle from '../../../utils/useToggle'
import {
  isDataOnly,
  HELIUM_OLD_MAKER_ADDRESS,
  isRelay,
} from '../../../utils/hotspotUtils'
import TouchableOpacityBox from '../../../components/TouchableOpacityBox'
import Articles from '../../../constants/articles'
import HotspotListItem from '../../../components/HotspotListItem'
import Info from '../../../assets/images/info-hollow.svg'
import Location from '../../../assets/images/location.svg'
import Signal from '../../../assets/images/signal.svg'
import VisibilityOff from '../../../assets/images/visibility_off.svg'
import HotspotIcon from '../../../assets/images/hotspot-icon-small.svg'
import EarningsIcon from '../../../assets/images/earnings_icon.svg'
import WitnessIcon from '../../../assets/images/checklist_challenge_witness.svg'
import CheckCircle from '../../../assets/images/check-circle.svg'
import { distance } from '../../../utils/location'
import { useColors, useSpacing } from '../../../theme/themeHooks'
import HotspotSheetHandle from '../root/HotspotSheetHandle'
import { hp } from '../../../utils/layout'
import sleep from '../../../utils/sleep'
import usePrevious from '../../../utils/usePrevious'
import useHotspotSync from '../useHotspotSync'
import useAlert from '../../../utils/useAlert'
import { locale } from '../../../utils/i18n'
import { NO_FEATURES } from '../../../components/Map'

const hitSlop = { top: 24, bottom: 24 } as Insets

export type HotspotSnapPoints = { collapsed: number; expanded: number }
type Props = {
  hotspot?: Hotspot
  onLayoutSnapPoints?: ((snapPoints: HotspotSnapPoints) => void) | undefined
  onSelectHotspot: (hotspot: Hotspot) => void
  onChangeHeight: (height: number) => void
  visible: boolean
  toggleSettings: () => void
  animatedPosition: Animated.SharedValue<number>
}
const HotspotDetails = ({
  hotspot: propsHotspot,
  onLayoutSnapPoints,
  onSelectHotspot,
  visible,
  toggleSettings,
  animatedPosition,
  onChangeHeight,
}: Props) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const colors = useColors()
  const spacing = useSpacing()
  const address = propsHotspot?.address || ''
  const hotspotChartData =
    useSelector((state: RootState) => state.rewards.chartData[address]) || {}
  const hotspotDetailsData =
    useSelector(
      (state: RootState) => state.hotspotDetails.hotspotData[address],
    ) || {}
  const hiddenAddresses = useSelector(
    (state: RootState) => state.account.settings.hiddenAddresses,
  )
  const checklistEnabled = useSelector(
    (state: RootState) => state.features.checklistEnabled,
  )

  const { showOKAlert, showOKCancelAlert } = useAlert()
  const listRef = useRef<BottomSheet>(null)
  const scrollViewRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [isRelayed, setIsRelayed] = useState(false)
  const [timelineValue, setTimelineValue] = useState(7)
  const [timelineIndex, setTimelineIndex] = useState(2)
  const [snapPoints, setSnapPoints] = useState([0, 0])
  const [listIndex, setListIndex] = useState(-1)
  const prevListIndex = usePrevious(listIndex)
  const prevHotspotAddress = usePrevious(propsHotspot?.address)

  const { rewards, rewardSum, rewardsChange, loading = true } =
    hotspotChartData[timelineValue] || {}
  const { hotspot: hotspotDetailsHotspot, witnesses } = hotspotDetailsData || {}
  const [showStatusBanner, toggleShowStatusBanner] = useToggle(false)

  const hotspot = useMemo(() => hotspotDetailsHotspot || propsHotspot, [
    hotspotDetailsHotspot,
    propsHotspot,
  ])
  const prevHexId = usePrevious(hotspot?.locationHex)

  const { updateSyncStatus, hotspotSyncStatus } = useHotspotSync(hotspot)

  const dataOnly = useMemo(() => isDataOnly(hotspot), [hotspot])

  const makers = useSelector((state: RootState) => state.heliumData.makers)

  const isHidden = useMemo(
    () =>
      hotspot?.address ? hiddenAddresses?.includes(hotspot?.address) : false,
    [hiddenAddresses, hotspot?.address],
  )

  useEffect(() => {
    if (!visible) return
    if (isDataOnly(hotspot)) {
      setIsRelayed(false)
    } else {
      setIsRelayed(isRelay(hotspot?.status?.listenAddrs || []))
    }
  }, [hotspot, visible])

  useEffect(() => {
    if (visible || listIndex !== 1) return

    setListIndex(0)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore bottom sheet type bug https://github.com/gorhom/react-native-bottom-sheet/issues/708
    listRef.current?.snapTo(0)
  }, [listIndex, visible])

  const rewardChartData = useMemo(() => {
    if (!visible) return []

    const data = getRewardChartData(rewards, timelineValue)
    return data || []
  }, [timelineValue, rewards, visible])

  // load hotspot data
  useEffect(() => {
    if (
      !address ||
      listIndex === 0 ||
      (listIndex === 1 && prevListIndex === 1) ||
      (listIndex === -1 && prevListIndex === -1)
    ) {
      return
    }
    dispatch(fetchHotspotData(address))

    dispatch(
      fetchChartData({
        address,
        numDays: timelineValue,
        resource: 'hotspots',
      }),
    )
  }, [address, dispatch, hotspot, listIndex, prevListIndex, timelineValue])

  useEffect(() => {
    updateSyncStatus()
  }, [updateSyncStatus])

  const formattedHotspotName = useMemo(() => {
    if (!hotspot || !hotspot.address) return ''

    const name = animalName(hotspot.address)
    const pieces = name.split(' ')
    if (pieces.length < 3) return name

    return [`${pieces[0]} ${pieces[1]}`, pieces[2]]
  }, [hotspot])

  const selectData = useMemo(() => {
    const data = [
      {
        label: t('hotspot_details.overview'),
        value: 'overview',
        color: 'purpleMain',
        Icon: EarningsIcon,
      } as HeliumSelectItemType,
    ]

    if (!isDataOnly(hotspot)) {
      if (checklistEnabled) {
        data.push({
          label: t('hotspot_details.checklist'),
          value: 'checklist',
          color: 'purpleMain',
          Icon: WitnessIcon,
        } as HeliumSelectItemType)
      }
      data.push({
        label: t('map_filter.witness.title'),
        value: 'witnesses',
        color: 'purpleMain',
        Icon: CheckCircle,
      } as HeliumSelectItemType)
    }
    return data
  }, [checklistEnabled, hotspot, t])

  const [selectedOption, setSelectedOption] = useState(selectData[0].value)

  const handleSelectValueChanged = useCallback(
    (value: string | number, _index: number) => {
      animateTransition('HotspotDetails.HandleSelectValueChanged', {
        enabledOnAndroid: false,
      })
      setSelectedOption(value)
    },
    [],
  )

  const handleRelayedPress = useCallback(async () => {
    const decision = await showOKCancelAlert({
      titleKey: 'hotspot_details.relay_prompt.title',
      messageKey: 'hotspot_details.relay_prompt.message',
      cancelKey: 'discovery.troubleshooting_guide',
      cancelStyle: 'cancel',
    })

    if (!decision && Linking.canOpenURL(Articles.Relay)) {
      Linking.openURL(Articles.Relay)
    }
  }, [showOKCancelAlert])

  const getDistance = useCallback(
    (otherHotspot: Hotspot | Witness) => {
      if (
        !hotspot?.lat ||
        !hotspot?.lng ||
        !otherHotspot?.lat ||
        !otherHotspot?.lng
      )
        return undefined
      const distanceKM = distance(
        {
          latitude: hotspot?.lat,
          longitude: hotspot?.lng,
        },
        { latitude: otherHotspot?.lat, longitude: otherHotspot?.lng },
      )
      if (distanceKM < 1) {
        return t('generic.meters', { distance: (distanceKM * 1000).toFixed(0) })
      }
      return t('generic.kilometers', { distance: distanceKM.toFixed(1) })
    },
    [hotspot?.lat, hotspot?.lng, t],
  )

  const renderWitnessItem = useCallback(
    (witness: Witness) => {
      return (
        <HotspotListItem
          pressable={false}
          key={witness.address}
          onPress={onSelectHotspot}
          gateway={witness as Hotspot}
          showAddress={false}
          distanceAway={getDistance(witness)}
          showRewardScale
          showRelayStatus
          showAntennaDetails
        />
      )
    },
    [getDistance, onSelectHotspot],
  )

  const showWitnessAlert = useCallback(async () => {
    const decision = await showOKCancelAlert({
      titleKey: 'hotspot_details.witness_prompt.title',
      messageKey: 'hotspot_details.witness_prompt.message',
      cancelKey: 'discovery.troubleshooting_guide',
      cancelStyle: 'cancel',
    })

    if (!decision && Linking.canOpenURL(Articles.Witnesses)) {
      Linking.openURL(Articles.Witnesses)
    }
  }, [showOKCancelAlert])

  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const nextSnapPoints = [event.nativeEvent.layout.height, hp(55)]
    onLayoutSnapPoints?.({
      collapsed: nextSnapPoints[0],
      expanded: nextSnapPoints[1],
    })
    setSnapPoints(nextSnapPoints)
  }

  const handleChange = useCallback(
    (index: number) => {
      setListIndex(index)
      onChangeHeight(snapPoints[index])
    },
    [onChangeHeight, snapPoints],
  )

  const handleToggleStatus = useCallback(async () => {
    if (dataOnly) {
      showOKAlert({
        titleKey: 'hotspot_details.data_only_prompt.title',
        messageKey: 'hotspot_details.data_only_prompt.message',
      })
      return
    }
    if (listIndex === 0) {
      setListIndex(1)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore bottom sheet type bug https://github.com/gorhom/react-native-bottom-sheet/issues/708
      listRef.current?.snapTo(1)
      if (showStatusBanner) {
        return // banner is already showing, but was out of sight
      }
    }
    if (listIndex === 0) {
      await sleep(300) // Add a little delay to avoid animation jank
    }
    toggleShowStatusBanner()
  }, [
    dataOnly,
    listIndex,
    showOKAlert,
    showStatusBanner,
    toggleShowStatusBanner,
  ])

  const contentContainerStyle = useMemo(
    () => ({
      paddingLeft: !isDataOnly(hotspot) ? spacing.m : undefined,
    }),
    [hotspot, spacing.m],
  )

  const onTimelineChanged = useCallback(
    (value, index) => {
      setTimelineValue(value)
      setTimelineIndex(index)

      dispatch(
        fetchChartData({
          address,
          numDays: value,
          resource: 'hotspots',
        }),
      )
    },
    [address, dispatch],
  )

  useEffect(() => {
    // contract the bottom sheet when a new hotspot is selected
    if (
      propsHotspot?.address &&
      prevHotspotAddress &&
      prevHotspotAddress !== propsHotspot?.address &&
      listIndex !== 0
    ) {
      setListIndex(0)
      listRef.current?.snapTo(0)
      setSelectedOption(selectData[0].value)
      scrollViewRef.current?.scrollTo({ y: 0, x: 0, animated: false })
    } else {
      const currentHex = hotspot?.locationHex
      if (
        prevHexId === undefined ||
        currentHex === undefined ||
        prevHexId === currentHex
      )
        return
      const shouldClose = currentHex === NO_FEATURES
      if (shouldClose && listIndex !== -1) {
        setListIndex(-1)
        listRef.current?.close()
      } else if (!shouldClose && listIndex !== 0) {
        setListIndex(0)
        listRef.current?.snapTo(0)
        scrollViewRef.current?.scrollTo({ y: 0, x: 0, animated: false })
      }
    }
  }, [
    hotspot?.locationHex,
    listIndex,
    prevHexId,
    prevHotspotAddress,
    propsHotspot?.address,
    selectData,
  ])

  const makerName = useMemo(() => {
    if (hotspot?.payer === HELIUM_OLD_MAKER_ADDRESS) {
      // special case for old Helium Hotspots
      return 'Helium'
    }
    return makers?.find((m) => m.address === hotspot?.payer)?.name
  }, [hotspot?.payer, makers])

  const bottomSheetBackground = useCallback(
    () => <Box flex={1} backgroundColor="white" />,
    [],
  )

  if (!hotspot) return null

  return (
    <BottomSheet
      snapPoints={snapPoints}
      ref={listRef}
      onChange={handleChange}
      handleComponent={null}
      animatedIndex={animatedPosition}
      backgroundComponent={bottomSheetBackground}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="always"
        ref={scrollViewRef}
        style={{ backgroundColor: 'white' }}
      >
        <Box paddingBottom="l" backgroundColor="white">
          <Box onLayout={handleHeaderLayout}>
            <HotspotSheetHandle
              hotspot={hotspot}
              toggleSettings={toggleSettings}
            />
            <Box marginBottom="lm" alignItems="flex-start" marginHorizontal="m">
              {hotspot.address === undefined ? (
                <SkeletonPlaceholder>
                  <SkeletonPlaceholder.Item
                    height={29}
                    width={250}
                    borderRadius={spacing.s}
                  />
                  <SkeletonPlaceholder.Item
                    height={29}
                    marginTop={spacing.xs}
                    width={150}
                    borderRadius={spacing.s}
                  />
                </SkeletonPlaceholder>
              ) : (
                <>
                  <Text
                    variant="light"
                    fontSize={29}
                    lineHeight={31}
                    color={isHidden ? 'grayLightText' : 'black'}
                    numberOfLines={1}
                    width="100%"
                    adjustsFontSizeToFit
                  >
                    {formattedHotspotName[0]}
                  </Text>
                  <Box flexDirection="row" alignItems="center">
                    <Text
                      variant="regular"
                      fontSize={29}
                      lineHeight={31}
                      paddingRight="s"
                      color={isHidden ? 'grayLightText' : 'black'}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formattedHotspotName[1]}
                    </Text>
                    {isHidden && <VisibilityOff height={20} width={20} />}
                  </Box>
                </>
              )}
            </Box>
            <Box
              flexDirection="row"
              justifyContent="flex-start"
              alignItems="center"
              marginBottom="m"
              marginLeft="m"
              opacity={hotspot.address === undefined ? 0 : 100}
            >
              <Location
                width={10}
                height={10}
                color={isHidden ? colors.grayLightText : colors.grayText}
              />
              {hotspot?.geocode?.longCity === undefined ? (
                <SkeletonPlaceholder>
                  <SkeletonPlaceholder.Item
                    height={14}
                    width={105}
                    marginLeft={spacing.xs}
                    marginRight={spacing.s}
                    borderRadius={spacing.s}
                  />
                </SkeletonPlaceholder>
              ) : (
                <Text
                  variant="body2"
                  color={isHidden ? 'grayLightText' : 'grayText'}
                  marginLeft="xs"
                  marginRight="m"
                >
                  {`${hotspot?.geocode?.longCity}, ${hotspot?.geocode?.shortCountry}`}
                </Text>
              )}
              <Signal
                width={10}
                height={10}
                color={isHidden ? colors.grayLightText : colors.grayText}
              />
              {hotspot?.elevation === undefined ? (
                <SkeletonPlaceholder>
                  <SkeletonPlaceholder.Item
                    height={14}
                    width={75}
                    marginLeft={spacing.xs}
                    marginRight={spacing.s}
                    borderRadius={spacing.s}
                  />
                </SkeletonPlaceholder>
              ) : (
                <Text
                  variant="body2"
                  color={isHidden ? 'grayLightText' : 'grayText'}
                  marginLeft="xs"
                >
                  {t('generic.meters', { distance: hotspot?.elevation || 0 })}
                </Text>
              )}
              {hotspot?.gain !== undefined && (
                <Text
                  variant="body2"
                  color={isHidden ? 'grayLightText' : 'grayText'}
                  marginLeft="xs"
                >
                  {(hotspot.gain / 10).toLocaleString(locale, {
                    maximumFractionDigits: 1,
                  }) + t('antennas.onboarding.dbi')}
                </Text>
              )}
              {makerName && (
                <Box
                  marginLeft="m"
                  flexDirection="row"
                  alignItems="center"
                  width="33%"
                >
                  <HotspotIcon
                    width={10}
                    height={10}
                    color={isHidden ? colors.grayLightText : colors.grayText}
                  />
                  <Text
                    variant="body2"
                    color={isHidden ? 'grayLightText' : 'grayText'}
                    marginLeft="xs"
                    ellipsizeMode="tail"
                    numberOfLines={1}
                  >
                    {makerName}
                  </Text>
                </Box>
              )}
            </Box>
            <Box
              flexDirection="row"
              justifyContent="flex-start"
              marginBottom="lx"
              marginLeft="m"
              height={24}
            >
              {hotspot?.status !== undefined &&
                hotspotSyncStatus?.status !== undefined && (
                  <StatusBadge
                    hitSlop={hitSlop}
                    online={hotspot?.status?.online}
                    syncStatus={hotspotSyncStatus?.status}
                    onPress={handleToggleStatus}
                    isDataOnly={dataOnly}
                  />
                )}
              {isRelayed && (
                <TouchableOpacityBox
                  hitSlop={hitSlop}
                  borderColor="orangeMedium"
                  borderWidth={1}
                  paddingHorizontal="s"
                  borderRadius="l"
                  alignItems="center"
                  justifyContent="center"
                  marginLeft="xs"
                  onPress={handleRelayedPress}
                >
                  <Text color="orangeMedium" variant="medium" fontSize={14}>
                    {t('hotspot_details.relayed')}
                  </Text>
                </TouchableOpacityBox>
              )}
              <HexBadge
                hitSlop={hitSlop}
                hotspotId={hotspot.address}
                rewardScale={hotspot.rewardScale}
                backgroundColor="grayBoxLight"
                visible={!isDataOnly(hotspot)}
              />
            </Box>
          </Box>

          <HotspotStatusBanner
            hotspot={hotspot}
            marginBottom="l"
            visible={showStatusBanner}
            onDismiss={toggleShowStatusBanner}
          />

          <Box
            justifyContent={isDataOnly(hotspot) ? 'center' : 'flex-start'}
            flexDirection="row"
            backgroundColor="grayBoxLight"
          >
            <HeliumSelect
              showGradient={false}
              scrollEnabled={false}
              marginTop="m"
              contentContainerStyle={contentContainerStyle}
              data={selectData}
              backgroundColor="grayBoxLight"
              flex={undefined}
              width={undefined}
              selectedValue={selectedOption}
              onValueChanged={handleSelectValueChanged}
            />
          </Box>
          <HotspotChecklist
            paddingTop="lx"
            backgroundColor="grayBoxLight"
            visible={selectedOption === 'checklist'}
            hotspot={hotspot}
            witnesses={witnesses}
          />

          {selectedOption === 'overview' && (
            <HotspotDetailChart
              title={t('hotspot_details.reward_title')}
              subtitle={t('hotspot_details.reward_subtitle')}
              number={rewardSum?.floatBalance.toFixed(2)}
              change={rewardsChange}
              data={rewardChartData}
              loading={loading}
              onTimelineChanged={onTimelineChanged}
              timelineIndex={timelineIndex}
            />
          )}

          {selectedOption === 'witnesses' && (
            <>
              {hotspotDetailsData.loading ? (
                <Box
                  paddingTop="xl"
                  backgroundColor="grayBoxLight"
                  height="100%"
                >
                  <ActivityIndicator color={colors.grayMain} />
                </Box>
              ) : (
                <>
                  <Box
                    backgroundColor="grayBoxLight"
                    marginBottom="xxs"
                    paddingTop="m"
                  >
                    <Box
                      alignItems="center"
                      flexDirection="row"
                      paddingTop="m"
                      paddingBottom="s"
                    >
                      <Text
                        variant="body1Medium"
                        color="grayDarkText"
                        fontSize={22}
                        paddingLeft="m"
                        paddingRight="s"
                      >
                        {t('hotspot_details.num_witnesses', {
                          count: witnesses?.length || 0,
                        })}
                      </Text>
                      <TouchableOpacityBox
                        onPress={showWitnessAlert}
                        hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                      >
                        <Info color={colors.blueMain} />
                      </TouchableOpacityBox>
                    </Box>
                    <Text
                      paddingHorizontal="m"
                      paddingBottom="m"
                      color="grayDarkText"
                    >
                      {t(
                        witnesses?.length === 0
                          ? 'hotspot_details.witness_desc_none'
                          : 'hotspot_details.witness_desc',
                        {
                          hotspotAnimal: formattedHotspotName[1],
                        },
                      )}
                    </Text>
                    {witnesses?.length === 0 && (
                      <Box
                        borderRadius="m"
                        backgroundColor="grayHighlight"
                        margin="m"
                        padding="m"
                      >
                        <Text
                          marginBottom="xs"
                          color="purpleLightText"
                          variant="medium"
                        >
                          {t('hotspot_details.get_witnessed')}
                        </Text>
                        <Text color="purpleText" variant="light" fontSize={15}>
                          {t('hotspot_details.get_witnessed_desc')}
                        </Text>
                      </Box>
                    )}
                  </Box>
                  {witnesses?.map((witness) => renderWitnessItem(witness))}
                </>
              )}
            </>
          )}
        </Box>
      </BottomSheetScrollView>
    </BottomSheet>
  )
}

export default HotspotDetails
